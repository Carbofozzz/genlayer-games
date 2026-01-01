# v0.1.0
# { "Depends": "py-genlayer:latest" }
from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import json

@gl.contract_interface
class StatIface:
    class View:
        def get_nicknames(self) -> dict: ...
 
    class Write:
        def add_user_points_by_game(self, player_address: str, game_type: u256, point: u256) -> None: ...
        def add_game_to_archive(self, player_address: str, game_id: str, is_creator: bool, game_time: str, game_type: u256) -> None: ...
        def add_user_points_game_to_archive(self, player_address: str, game_id: str, game_time: str, game_type: u256, point: u256) -> None: ...

@gl.contract_interface
class StorageIface:
    class View:
        def get_game(self, game_id: str) -> dict: ...

    class Write:
        def add_game(self, game: dict) -> None: ...

@allow_storage
@dataclass
class Score:
    score_value: u256
    score_answer: str

    def to_dict(self, address: str, full: bool):
        if full:
            return {"score": str(self.score_value), "answer": str(self.score_answer), "address": address}
        return {"address": address}

@allow_storage
@dataclass
class Game:
    game_id: str
    game_creator: Address
    game_time: str
    game_duration: u256
    game_ingredients: DynArray[str]
    game_players: TreeMap[Address, Score]

    def __init__(self, game_id: str):
        self.game_id = game_id

    def to_dict(self, time_str: str):
        if _check_time_due(self, time_str):
            return {
                "game_id": self.game_id, 
                "game_creator": self.game_creator.as_hex,
                "game_time": self.game_time,
                "game_duration": str(self.game_duration),
                "game_ingredients": _parse_ingredients(self.game_ingredients), 
                "game_players": _parse_players(self.game_players, True)
            }
        return {
            "game_id": self.game_id, 
            "game_creator": self.game_creator.as_hex, 
            "game_time": self.game_time,
            "game_duration": str(self.game_duration),
            "game_ingredients": _parse_ingredients(self.game_ingredients),
            "game_players": _parse_players(self.game_players, False),
            "game_time_left": str(float(self.game_time) + (self.game_duration * 60) - float(_convert_time(time_str)))
        }

class Cook(gl.Contract):
    game_duration: u256
    game_coeff: u256
    error: str
    owner: Address
    stat: Address
    storage: Address
    active_games: TreeMap[Address, Game]

    def __init__(self, stat_contract: str, storage_contract: str):
        self.game_duration = 10
        self.game_coeff = 50
        self.error = "None"
        self.owner = gl.message.sender_address
        self.stat = Address(stat_contract)
        self.storage = Address(storage_contract)

    @gl.public.write
    def set_game_duration(self, duration: int) -> None:
        self._only_owner()
        self.game_duration = duration

    @gl.public.write
    def set_game_coeff(self, coeff: int) -> None:
        self._only_owner()
        self.game_coeff = coeff

    @gl.public.write
    def add_stat_contract(self, stat_contract: str) -> None:
        self._only_owner()
        self.stat = Address(stat_contract)

    @gl.public.write
    def add_storage_contract(self, storage_contract: str) -> None:
        self._only_owner()
        self.storage = Address(storage_contract)

    @gl.public.write
    def create_game(self, game_id: str, lang: str) -> None:
        self.create_game_duration(game_id, lang, int(self.game_duration))

    @gl.public.write
    def create_game_duration(self, game_id: str, lang: str, duration: int) -> None:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        game_archive = StorageIface(self.storage).view().get_game(game_id)
        if game_id == game_archive.get("game_id", ""):
            raise Exception("Game already created")
        if game_cache is not None and game_cache.game_id == game_id:
            raise Exception("Game already created")
        time_str = gl.message_raw["datetime"]
        cache_active = game_cache is not None and not _check_time_due(game_cache, time_str)
        if cache_active:
            raise Exception("You have an unfinished game")
        if game_cache is not None:
            StorageIface(self.storage).emit().add_game(game_cache.to_dict(time_str))
        
        def leader_fn():
            task_prompt = f"""
Choose four cooking ingredients that can be used in a recipe.
These can be absolutely any ingredients that can be edible and cooked.

Choose four cooking ingredients completely at random from a very wide space of ingredients.
Requirements:
   - They can be from any cuisine in the world.
   - They do not need to form a classic flavor combination.
   - At least one ingredient should be relatively uncommon in everyday home cooking.

Output:
A JSON-array with 4 ingredients.
Ingredients must be translated into {lang}.

Return a JSON with the name as follows:
{{
    "ingredient_1": str,
    "ingredient_2": str,
    "ingredient_3": str,
    "ingredient_4": str
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
            """
            result = gl.nondet.exec_prompt(task_prompt)
            return _extract_json_from_string(result)

        def check_leader_fn(ingredient_1: str, ingredient_2: str, ingredient_3: str, ingredient_4: str):
            task_prompt = f"""
Confirm that {ingredient_1}, {ingredient_2}, {ingredient_3}, and {ingredient_4} are edible and can be used for cooking.

Output:
A clear yes or no answer in the form of a Boolean variable: True or False.

Return a JSON with the name as follows:
{{
    "result": bool

}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
            """
            result = gl.nondet.exec_prompt(task_prompt)
            return json.loads(_extract_json_from_string(result))

        def validator_fn(leader_res: gl.vm.Result) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            ingredients = json.loads(leader_res.calldata)
            validator_res = check_leader_fn(ingredients["ingredient_1"], ingredients["ingredient_2"], ingredients["ingredient_3"], ingredients["ingredient_4"])
            return validator_res["result"]
        
        result = gl.vm.run_nondet(leader_fn, validator_fn)
        ingredients = json.loads(result)
        t = _convert_time(time_str)
        game = Game(game_id)
        game.game_creator = sender_address
        game.game_time = t
        game.game_duration = duration
        game.game_ingredients.append(ingredients["ingredient_1"])
        game.game_ingredients.append(ingredients["ingredient_2"])
        game.game_ingredients.append(ingredients["ingredient_3"])
        game.game_ingredients.append(ingredients["ingredient_4"])
        self.active_games[sender_address] = game
        StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, game_id, True, str(t), 7)
        self.error = str(game.game_ingredients)

    @gl.public.write
    def join_game(self, game_id: str, game_answer: str) -> None:
        sender_address = gl.message.sender_address
        game_cache = next((v for k, v in self.active_games.items() if v.game_id == game_id), None)
        if game_cache is None:
            raise Exception("Game not found")
        if sender_address in game_cache.game_players:
            raise Exception("You have already played")
        time_str = gl.message_raw["datetime"]
        if _check_time_due(game_cache, time_str):
            raise Exception("Time is off")
        speed_ratio = _check_speed_ratio(game_cache, time_str)
        ingredient_1 = game_cache.game_ingredients[0]
        ingredient_2 = game_cache.game_ingredients[1]
        ingredient_3 = game_cache.game_ingredients[2]
        ingredient_4 = game_cache.game_ingredients[3]
        def leader_fn():
            task_prompt = f"""
Check {game_answer} against the following criteria. 
First, determine that it's a cooking recipe, not just words like "stir and fry," but a complete recipe for preparing a dish. 
Second, ensure that the recipe uses only these ingredients: {ingredient_1}, {ingredient_2}, {ingredient_3}, {ingredient_4}. 
Third, evaluate the correctness of the cooking process. Originality and uniqueness are also important.
Rate this recipe on a scale of 0 to 6. 
Scores are calculated as follows: 
- a realistic recipe that can be repeated (1 point),
- all four ingredients from the list and only these four (4 points), 
ingredients from the list are partially used (1 point for each ingredient), 
an additional ingredient not on the list is added (penalty -1 point; only water or vegetable oil for frying can be added without penalty; 
everything else, including spices, oil, etc., is penalized. The penalty cannot exceed the total points for that item, i.e., 
if one ingredient from the list and five not on the list are used, the total score for the ingredients is 0),
please note that the user may write the names of ingredients in the recipe with minor grammatical errors,
- correct cooking process (1 point),
- correct combination of flavors in the finished dish (1 point),
- originality (1 point).

Return a JSON with the name as follows:
{{
    "recipe_score": int,
    "explain_scoring": str
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
            """
            result = gl.nondet.exec_prompt(task_prompt)
            return json.loads(_extract_json_from_string(result))
        def validator_fn(
            leader_score: gl.vm.Result,
        ) -> bool:
            if not isinstance(leader_score, gl.vm.Return):
                return False
            leader_res = leader_score.calldata
            validator_res = leader_fn()
            leader_score = leader_res["recipe_score"]
            validator_score = validator_res["recipe_score"]
            if validator_score == 0 or leader_score == 0:
                return validator_score == leader_score
            return abs(validator_score - leader_score) <= 1

        result_ai = gl.vm.run_nondet(leader_fn, validator_fn)  

        try:
            ai_score = result_ai["recipe_score"]
            score_num = float(ai_score) * float(self.game_coeff) * speed_ratio
            game_cache.game_players[sender_address] = Score(score_value=int(score_num), score_answer=game_answer)
            if sender_address != game_cache.game_creator:
                StatIface(self.stat).emit().add_user_points_game_to_archive(sender_address.as_hex, game_id, game_cache.game_time, 7, int(score_num))
            else:
                StatIface(self.stat).emit().add_user_points_by_game(sender_address.as_hex, 7, int(score_num))
            self.error = str(score_num) + " " + result_ai["explain_scoring"]
        except Exception as e:
            self.error = "error answer: " + str(e)

    @gl.public.view
    def get_game_coeff(self) -> int:
        return int(self.game_coeff)

    @gl.public.view
    def get_game_duration(self) -> int:
        return int(self.game_duration)

    @gl.public.view
    def get_error(self) -> str:
        return self.error

    @gl.public.view
    def get_game(self, game_id: str) -> dict:
        try:
            game_cache = next((v for k, v in self.active_games.items() if v.game_id == game_id), None)
            game = StorageIface(self.storage).view().get_game(game_id)
            if game_cache is not None:
                game = game_cache.to_dict(gl.message_raw["datetime"])  
            if "error" in game:
                raise Exception(game.get("error"))
            nicknames = StatIface(self.stat).view().get_nicknames()
            return json.dumps(_select_game(game, nicknames))
        except Exception as e:
            return json.dumps({ "error": str(e) })

    @gl.public.view
    def get_my_game(self) -> dict:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        try:
            if game_cache is not None:
                game = game_cache.to_dict(gl.message_raw["datetime"])  
                nicknames = StatIface(self.stat).view().get_nicknames()
                return json.dumps(_select_game(game, nicknames))
            return json.dumps({ "error": "Game not found" })
        except Exception as e:
            return json.dumps({ "error": str(e) })

    def _only_owner(self):
        if gl.message.sender_address != self.owner:
            raise Exception("You are not the owner")

def _select_game(game: dict[str, str], nicks: dict[str, str]) -> dict:
    players = game.get("game_players", [])
    for pl in players:
        pl["nick"] = nicks.get(pl.get("address"), "")
    return game

def _check_speed_ratio(game: Game, time_str: str) -> float:
    return 1.0 - (float(_convert_time(time_str)) - float(game.game_time)) / (float(game.game_duration) * 60)

def _parse_ingredients(ingredients: DynArray[str]) -> list:
    result = []
    for ingredient in ingredients:
        result.append(ingredient)
    return result

def _parse_players(players: TreeMap[Address, Score], full: bool) -> dict:
    result = []
    for address, score in players.items():
        result.append(score.to_dict(str(address.as_hex), full))
    return result

def _check_time_due(game: Game, time_str: str) -> bool:
    return float(_convert_time(time_str)) - float(game.game_time) >= game.game_duration * 60

def _convert_time(time_str: str) -> str:
    dt = datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    return str(dt.timestamp())

def _extract_json_from_string(s: str) -> str:
    """
    Extract a JSON object from a string.

    Args:
        s (str): The string potentially containing a JSON object.

    Returns:
        str: The extracted JSON string, or an empty string if no valid JSON is found.
    """
    start_index = s.find("{")
    end_index = s.rfind("}")
    if start_index != -1 and end_index != -1 and start_index < end_index:
        return s[start_index : end_index + 1]
    else:
        return ""
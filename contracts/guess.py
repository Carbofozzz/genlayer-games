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
        def get_game(self, game_id: str, pwd: str) -> dict: ...

    class Write:
        def add_game(self, game_id: str, game_creator: str, game_image_link: str, game_image_desc: str, game_type: int, duration: int, time: str) -> None: ...
        def replace_game(self, game_id: str, game_creator: str, game_image_link: str, game_image_desc: str, game_type: int, duration: int, time: str, scores: dict[str, str], answers: dict[str, str]) -> None: ...
        def edit_game(self, game_id: str, player: str, score: int, answer: str) -> None: ...

@allow_storage
@dataclass
class Score:
    score: u256
    answer: str

    def to_dict(self, address: str, full: bool):
        if full:
            return {"score": str(self.score), "answer": str(self.answer), "address": address}
        return {"address": address}

@allow_storage
@dataclass
class Game:
    game_id: str
    game_creator: Address
    game_time: str
    game_type: u256
    game_duration: u256
    game_image_link: str
    game_image_desc: str
    game_players: TreeMap[Address, Score]

    def to_dict(self, admin: bool, time_str: str):
        if _check_time_due(self, time_str):
            return {
                "game_id": self.game_id, 
                "game_creator": self.game_creator.as_hex,
                "game_time": self.game_time,
                "game_type": str(self.game_type),
                "game_duration": str(self.game_duration),
                "game_image_link": self.game_image_link, 
                "game_image_desc": self.game_image_desc, 
                "game_players": _parse_players(self.game_players, True)
            }
        desc = ""
        if self.game_type == 2 or admin:
            desc = self.game_image_desc
        return {
            "game_id": self.game_id, 
            "game_creator": self.game_creator.as_hex, 
            "game_time": self.game_time,
            "game_type": str(self.game_type),
            "game_duration": str(self.game_duration),
            "game_image_link": self.game_image_link, 
            "game_image_desc": desc,
            "game_time_left": str(float(self.game_time) + (self.game_duration * 60) - float(_convert_time(time_str))),
            "game_players": _parse_players(self.game_players, False)
        }

class GuessPicture(gl.Contract):
    game_duration: u256
    game_coeff: u256
    error: str
    secret: str
    owner: Address
    stat: Address
    storage: Address
    active_games: TreeMap[Address, Game]

    def __init__(self, stat_contract: str, storage_contract: str):
        self.game_duration = 10
        self.game_coeff = 50
        self.error = "None"
        self.secret = ""
        self.owner = gl.message.sender_address
        self.stat = Address(stat_contract)
        self.storage = Address(storage_contract)

    @gl.public.write
    def add_secret(self, new_secret: str):
        if self.owner != gl.message.sender_address:
            raise Exception("You are not the owner")
        self.secret = new_secret

    @gl.public.write
    def add_stat_contract(self, stat_contract: str) -> None:
        if self.owner != gl.message.sender_address:
            raise Exception("You are not the owner")
        self.stat = Address(stat_contract)

    @gl.public.write
    def add_storage_contract(self, storage_contract: str) -> None:
        if self.owner != gl.message.sender_address:
            raise Exception("You are not the owner")
        self.storage = Address(storage_contract)

    @gl.public.write
    def set_game_duration(self, duration: int) -> None:
        if self.owner != gl.message.sender_address:
            raise Exception("You are not the owner")
        self.game_duration = duration

    @gl.public.write
    def set_game_coeff(self, coeff: int) -> None:
        if self.owner != gl.message.sender_address:
            raise Exception("You are not the owner")
        self.game_coeff = coeff

    @gl.public.write
    def create_game(self, game_id: str, image_link: str) -> None:
        self.create_game_duration(game_id, image_link, int(self.game_duration))

    @gl.public.write
    def create_game_duration(self, game_id: str, image_link: str, duration: int) -> None:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        if game_cache is not None and game_cache.game_id == game_id:
            raise Exception("Game already created")
        if game_cache is not None and game_cache.game_id != game_id:
            scores = {k.as_hex: str(v.score) for k, v in game_cache.game_players.items()}
            answers = {k.as_hex: v.answer for k, v in game_cache.game_players.items()}
            StorageIface(self.storage).emit().replace_game(
                game_cache.game_id, 
                game_cache.game_creator.as_hex,
                game_cache.game_image_link, 
                game_cache.game_image_desc, 
                1, 
                int(game_cache.game_duration),
                game_cache.game_time,
                scores,
                answers
            )
        game_storage = StorageIface(self.storage).view().get_game(game_id, "")
        if "game_id" in game_storage:
            raise Exception("Game already created")
        desc_image_prompt = """
Analyze and describe the following image and return the name of the main object on it.
Return a JSON with the name as follows
{{
    "object": str, // the name of the main object in the image
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
                """
        def non_det() -> str:
            try:
                web_data = gl.nondet.web.render(image_link, mode = "screenshot")
                result = gl.nondet.exec_prompt(desc_image_prompt, images=[web_data])
                return json.loads(_extract_json_from_string(result)).get("object", "None")
            except Exception as e:
                return "error: " + str(e)
        result_ai = gl.eq_principle.strict_eq(non_det)
        try:
            t = _convert_time(gl.message_raw["datetime"])
            game = Game(
                game_id=game_id,
                game_creator=sender_address,
                game_time=t,
                game_type=1,
                game_duration=duration,
                game_image_link=image_link,
                game_image_desc=result_ai,
                game_players=TreeMap()
            )
            self.active_games[sender_address] = game
            StorageIface(self.storage).emit().add_game(game_id, sender_address.as_hex, image_link, result_ai, 1, duration, str(t))
            StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, game_id, True, str(t), 1)
            self.error = result_ai
        except Exception as e:
            self.error = "error create: " + str(e)

    @gl.public.write
    def join_game(self, game_id: str, answer: str) -> None:
        sender_address = gl.message.sender_address
        game_cache = next((v for k, v in self.active_games.items() if v.game_id == game_id), None)
        game = StorageIface(self.storage).view().get_game(game_id, self.secret)
        if game_cache is not None and game_cache.game_id == game_id:
            game = game_cache.to_dict(True, gl.message_raw["datetime"])

        if "error" in game:
            raise Exception("Game not found")
        if game.get("game_creator") == sender_address.as_hex:
            raise Exception("Creator cannot play")
        if "game_time_left" not in game:
            raise Exception("Time is off")
        if game.get("game_type") != "1":
            raise Exception("Wrong game type")
        if any(isinstance(p, dict) and isinstance(p.get("address"), str) and p["address"].lower() == sender_address.as_hex.lower() for p in game.get("game_players", [])):
            raise Exception("You have already played")

        speed_ratio = _check_speed_ratio(game, gl.message_raw["datetime"])
        src = game.get("game_image_desc")
        compare_prompt = f"""
Compare the following two texts: {src} and {answer}.
Estimate how similar they are in intended object/name and distinctive meaning.
Normalization (apply to both texts before comparison):
Lowercase, trim, collapse whitespace.
Remove punctuation except within numbers/dates.
Standardize dates to YYYY-MM-DD.
Convert number words to digits when unambiguous.
Cross-lingual normalization: translate tokens to a shared pivot language (English) when dictionary-stable (e.g., “кролик” → “rabbit”, “цвет” → “color”). Use conservative, high-confidence dictionary mappings only.
Transliteration fallback: when exact translation is uncertain, apply language-appropriate transliteration to compare forms (e.g., “раббит” ≈ “rabbit”, “крол” ≈ “krol”). Treat transliteration similarity as weaker than translation.
Near-lexeme/abbreviation handling: if a token is a plausible truncation/abbreviation/lemma of another (e.g., “rab” vs “rabbit”), count as a weak match only if no conflicting full-form exists and context supports the same entity/type. Otherwise, treat as mismatch.
Do not infer missing data beyond the above conservative mappings.
Identify explicitly present elements:
Core subject/object (the intended entity or name).
Key attributes/features (type, properties, qualifiers).
Actions/behaviors/events (verbs, relations), if relevant.
Concrete details/examples (numbers, named items, locations), if relevant.
Scoring (strict 0–4 scale):
4: Exact match of the intended object’s name in any language, or an exact synonym. Examples:“rabbit” vs “кролик” (rabbit).
“building” vs “edifice”.
“accordion” vs “аккордеон”.
3: Minor syntactic/morphological error in an otherwise correct answer (e.g., misspelling, inflectional variant), or a subspecies/subtype, or an inexact but closely similar synonym sharing most defining features. Examples:“rabitt” vs “rabbit”.
“bunny” vs “rabbit”.
“hare” vs “rabbit”.
“заяц” vs “rabbit”.
“structure” vs “building”.
“bayan” vs “accordion”.
2: The answer names a distinctive key feature without correctly naming the object. Examples:“long-eared” vs “hare”.
“very tall” vs “skyscraper”.
“fast projectile” vs “rocket”.
1: The answer matches only the broad category/group. Examples:“animal” vs “hare”.
“musical instrument” vs “piano”.
“building” vs “skyscraper”.
0: Anything else. No reliable overlap with the intended object; wrong entity; vague/irrelevant; or cross-lingual/near-lexeme equivalence cannot be established with reasonable confidence.
Conservative matching rules:
Credit only what is explicitly present in both texts after normalization.
Cross-lingual equivalence requires dictionary-stable or widely accepted mapping.
Transliteration/abbreviation matches can justify score 3 when strongly suggestive; if confidence is low or conflicting, assign 0.
No-idea fallback:
If you cannot establish at least the category or a distinctive feature with reasonable confidence, assign 0.
Output format (strict):
Output only a JSON object with a single key "score".
"score" must be an integer string in {"0","1","2","3","4"}.
Do not output anything else.

Return a JSON with the name as follows
{{
    "score": str, // the similarity score
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
            """
        def non_det():
            try:
                result = gl.nondet.exec_prompt(compare_prompt)
                return json.loads(_extract_json_from_string(result)).get("score", "0")
            except Exception as e:
                return "error: " + str(e)
        result_score = gl.eq_principle.strict_eq(non_det)
        try:
            score_num = float(result_score) * float(self.game_coeff) * speed_ratio
            if game_cache is not None and game_cache.game_id == game_id:
                game_cache.game_players[sender_address] = Score(score=int(score_num), answer=answer)
            StorageIface(self.storage).emit().edit_game(game_id, sender_address.as_hex, int(score_num), answer)
            StatIface(self.stat).emit().add_user_points_game_to_archive(sender_address.as_hex, game_id, game.get("game_time"), 1, int(score_num))
            self.error = str(score_num)
        except Exception as e:
            self.error = "error answer: " + str(e)

    @gl.public.view
    def get_error(self) -> str:
        return self.error

    @gl.public.view
    def get_game_duration(self) -> int:
        return int(self.game_duration)

    @gl.public.view
    def get_game_coeff(self) -> int:
        return int(self.game_coeff)

    @gl.public.view
    def get_game(self, game_id: str) -> str:
        game_cache = next((v for k, v in self.active_games.items() if v.game_id == game_id), None)
        game = StorageIface(self.storage).view().get_game(game_id, "")
        if game_cache is not None:
            game = game_cache.to_dict(False, gl.message_raw["datetime"])  
        try:
            if "error" in game:
                raise Exception(game.get("error"))
            nicknames = StatIface(self.stat).view().get_nicknames()
            return json.dumps(_select_game(game, nicknames, gl.message.sender_address))
        except Exception as e:
            return json.dumps({ "error": str(e) })

def _select_game(game: dict[str, str], nicks: dict[str, str], sender_address: Address) -> dict:
    if "game_time_left" not in game:
        players = game.get("game_players")
        for pl in players:
            pl["nick"] = nicks.get(pl.get("address"), "")
        return {
            "id": game.get("game_id"), 
            "type": int(game.get("game_type")),
            "creator": game.get("game_creator"), 
            "image": game.get("game_image_link"), 
            "desc": game.get("game_image_desc"), 
            "players": players
        }
    return {
            "id": game.get("game_id"), 
            "type": int(game.get("game_type")),
            "creator": game.get("game_creator"), 
            "time_left": game.get("game_time_left"), 
            "image": game.get("game_image_link"), 
            "desc": game.get("game_image_desc"),
            "answered": str(any(isinstance(p, dict) and isinstance(p.get("address"), str) and p["address"].lower() == sender_address.as_hex.lower() for p in game.get("game_players", []))) 
        }

def _check_speed_ratio(game: dict[str, str], time_str: str) -> float:
    return 1.0 - (float(_convert_time(time_str)) - float(game.get("game_time"))) / (float(game.get("game_duration")) * 60)

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
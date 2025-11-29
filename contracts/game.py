# v0.1.0
# { "Depends": "py-genlayer:latest" }
from genlayer import *
from dataclasses import dataclass

import json
import typing
import time

@gl.contract_interface
class StatIface:
    class View:
        def get_nicknames(self) -> dict: ...
 
    class Write:
        def set_user_point(self, player_address: str, point: u256) -> None: ...
        def add_game_to_archive(self, player_address: str, game_id: str, is_creator: bool, game_time: str, game_type: u256) -> None: ...

@allow_storage
@dataclass
class Score:
    score: float
    speed: float
    answer: str

    def to_dict(self, address: str, nick: str):
        return {"score": str(int(self.score)), "speed": str(self.speed), "answer": str(self.answer), "nick": nick, "address": address}

@allow_storage
@dataclass
class Game:
    game_id: str
    game_creator: Address
    game_time: float
    game_type: u256
    game_duration: float
    game_image_link: str
    game_image_desc: str
    game_players: TreeMap[Address, Score]

    def to_dict_active(self, answered: bool, time_left: str, image_desc: str):
        return {
            "id": self.game_id, 
            "type": self.game_type,
            "creator": str(self.game_creator.as_hex), 
            "time_left": time_left, 
            "image": self.game_image_link, 
            "desc": image_desc, 
            "answered": str(answered) 
        }

    def to_dict_completed(self, nicks: dict[str, str]):
        return {
            "id": self.game_id, 
            "type": self.game_type,
            "creator": str(self.game_creator.as_hex), 
            "image": self.game_image_link, 
            "desc": self.game_image_desc, 
            "players": _parse_players(self.game_players, nicks)
        }


class GuessPicture(gl.Contract):
    games_all: TreeMap[str, Game]
    game_duration: float
    game_coeff: float
    error: str
    owner: Address
    stat: Address

    def __init__(self):
        self.game_duration = 10
        self.game_coeff = 50
        self.error = "None"
        self.owner = gl.message.sender_address

    @gl.public.write
    def add_stat_contract(self, stat_contract: str) -> None:
        if self.owner != gl.message.sender_address:
            raise Exception("You are not the owner")
        self.stat = Address(stat_contract)

    @gl.public.write
    def create_match_game(self, game_id: str, image_desc: str) -> None:
        self.create_match_game_duration(game_id, image_desc, int(self.game_duration))

    @gl.public.write
    def create_match_game_duration(self, game_id: str, image_desc: str, duration: int) -> None:
        sender_address = gl.message.sender_address
        if game_id in self.games_all:
            raise Exception("Game already created")
        t = time.time()
        game = Game(
            game_id=game_id,
            game_creator=sender_address,
            game_time=t,
            game_type=2,
            game_duration=float(duration),
            game_image_link="",
            game_image_desc=image_desc,
            game_players=TreeMap()
        )
        self.games_all[game_id] = game
        StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, game_id, True, str(t), 2)

    @gl.public.write
    def create_game(self, game_id: str, image_link: str) -> None:
        self.create_game_duration(game_id, image_link, int(self.game_duration))

    @gl.public.write
    def create_game_duration(self, game_id: str, image_link: str, duration: int) -> None:
        sender_address = gl.message.sender_address
        if game_id in self.games_all:
            raise Exception("Game already created")
        def non_det():
            try:
                web_data = gl.nondet.web.render(image_link, mode = "screenshot")
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
                result = gl.nondet.exec_prompt(desc_image_prompt, images=[web_data])
                print("result",result)
                return json.loads(_extract_json_from_string(result))
            except Exception as e:
                return "error: " + str(e)
        result_json = gl.eq_principle.strict_eq(non_det)
        try:
            t = time.time()
            game = Game(
                game_id=game_id,
                game_creator=sender_address,
                game_time=t,
                game_type=1,
                game_duration=float(duration),
                game_image_link=image_link,
                game_image_desc=result_json["object"],
                game_players=TreeMap()
            )
            self.games_all[game_id] = game
            StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, game_id, True, str(t), 1)
            self.error = result_json["object"]
        except Exception as e:
            self.error = "error create: " + str(e)

    @gl.public.write
    def join_match_game(self, game_id: str, image_link: str) -> None:
        game = self.games_all.get(game_id)
        sender_address = gl.message.sender_address
        if game is None:
            raise Exception("Game not found")
        if _check_time_due(game):
            raise Exception("Time is off")
        if game.game_type == 1:
            raise Exception("Wrong game type")
        if sender_address in game.game_players:
            raise Exception("You have already played")
        speed_ratio = _check_speed_ratio(game)
        def non_det():
            try:
                web_data = gl.nondet.web.render(image_link, mode = "screenshot")
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
                result = gl.nondet.exec_prompt(desc_image_prompt, images=[web_data])
                print("result",result)
                return json.loads(_extract_json_from_string(result))
            except Exception as e:
                return "error match: " + str(e)
        result_json = gl.eq_principle.strict_eq(non_det)
        first = game.game_image_desc
        answer = result_json["object"]
        task = f"""
Compare the following two texts: {first} and {answer}.
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
        def non_det_2():
            try:
                result = gl.nondet.exec_prompt(task)
                print("result",result)
                return json.loads(_extract_json_from_string(result))
            except Exception as e:
                return "error match: " + str(e)
        result_json_2 = gl.eq_principle.strict_eq(non_det_2)
        try:
            score_str = result_json_2["score"]
            score_num = float(score_str) * self.game_coeff * speed_ratio
            game.game_players[sender_address] = Score(
                score=score_num, 
                speed=speed_ratio, 
                answer=image_link
            )
            StatIface(self.stat).emit().set_user_point(sender_address.as_hex, int(score_num))
            StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, game_id, sender_address == game.game_creator, str(game.game_time), 2)
            self.error = str(score_num)
        except Exception as e:
            self.error = "error answer match: " + str(e)  

    @gl.public.write
    def join_game(self, game_id: str, answer: str) -> None:
        game = self.games_all.get(game_id)
        sender_address = gl.message.sender_address
        if game is None:
            raise Exception("Game not found")
        if game.game_creator == sender_address:
            raise Exception("Creator cannot play")
        if _check_time_due(game):
            raise Exception("Time is off")
        if game.game_type == 2:
            raise Exception("Wrong game type")
        if sender_address in game.game_players:
            raise Exception("You have already played")

        speed_ratio = _check_speed_ratio(game)
        first = game.game_image_desc
        task = f"""
Compare the following two texts: {first} and {answer}.
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
                result = gl.nondet.exec_prompt(task)
                print("result",result)
                return json.loads(_extract_json_from_string(result))
            except Exception as e:
                return "error: " + str(e)
        result_json = gl.eq_principle.strict_eq(non_det)
        try:
            score_str = result_json["score"]
            score_num = float(score_str) * self.game_coeff * speed_ratio
            game.game_players[sender_address] = Score(
                score=score_num, 
                speed=speed_ratio, 
                answer=answer
            )
            StatIface(self.stat).emit().set_user_point(sender_address.as_hex, int(score_num))
            StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, game_id, False, str(game.game_time), 1)
            self.error = str(score_num)
        except Exception as e:
            self.error = "error answer: " + str(e)    

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
        game = self.games_all.get(game_id)
        try:
            if game is None:
                return json.dumps({ "error": "Game not found" })
            nicknames = StatIface(self.stat).view().get_nicknames()
            return json.dumps(_select_game(game, nicknames, gl.message.sender_address))
        except Exception as e:
            return json.dumps({ "error": str(e) })


def _safe_get_nick(address: Address, nicks: dict[str, str]) -> str:
    nick = nicks.get(address.as_hex)
    if nick is None:
        return ""
    return nick

def _parse_players(players: TreeMap[Address, Score], nicks: dict[str, str]) -> dict:
    result = []
    for address, score in players.items():
        result.append(score.to_dict(str(address.as_hex), _safe_get_nick(address, nicks)))
    return result   

def _select_game(game: Game, nicks: dict[str, str], sender_address: Address) -> dict:
    desc = ""
    if game.game_type == 2:
        desc = game.game_image_desc
    if _check_time_due(game):
        return game.to_dict_completed(nicks)
    return game.to_dict_active(
        sender_address in game.game_players,
        str(game.game_time + (game.game_duration * 60) - time.time()),
        desc
    )

def _check_time_due(game: Game) -> bool:
    return time.time() - game.game_time >= game.game_duration * 60

def _check_speed_ratio(game: Game) -> float:
    return 1.0 - (time.time() - game.game_time) / (game.game_duration * 60)

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
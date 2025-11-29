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

@gl.contract_interface
class StorageIface:
    class View:
        def get_game(self, game_id: str, pwd: str) -> dict: ...

    class Write:
        def add_game(self, game_id: str, game_creator: str, game_image_link: str, game_image_desc: str, game_type: int, duration: int) -> None: ...
        def edit_game(self, game_id: str, player: str, score: int, answer: str) -> None: ...

class DrawMatch(gl.Contract):
    game_duration: float
    game_coeff: float
    error: str
    secret: str
    owner: Address
    stat: Address
    storage: Address

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
    def create_game(self, game_id: str, image_desc: str) -> None:
        self.create_game_duration(game_id, image_desc, int(self.game_duration))

    @gl.public.write
    def create_game_duration(self, game_id: str, image_desc: str, duration: int) -> None:
        sender_address = gl.message.sender_address
        game = StorageIface(self.storage).view().get_game(game_id, "")
        if "game_id" in game:
            raise Exception("Game already created")
        try:
            StorageIface(self.storage).emit().add_game(game_id, sender_address.as_hex, "", image_desc, 2, duration)
            StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, game_id, True, str(time.time()), 2)
            self.error = image_desc
        except Exception as e:
            self.error = "error create: " + str(e)
        
    @gl.public.write
    def join_game(self, game_id: str, image_link: str) -> None:
        sender_address = gl.message.sender_address
        game = StorageIface(self.storage).view().get_game(game_id, self.secret)

        if "error" in game:
            raise Exception("Game not found")
        if "game_time_left" not in game:
            raise Exception("Time is off")
        if game.get("game_type") != "2":
            raise Exception("Wrong game type")
        if any(isinstance(p, dict) and isinstance(p.get("address"), str) and p["address"].lower() == sender_address.as_hex.lower() for p in game.get("game_players", [])):
            raise Exception("You have already played")

        speed_ratio = _check_speed_ratio(game)
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
        src = game.get("game_image_desc")
        compare_prompt = f"""
Compare the following two texts: {src} and {result_ai}.
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
                result = gl.nondet.exec_prompt(compare_prompt)
                return json.loads(_extract_json_from_string(result)).get("score", "0")
            except Exception as e:
                return "error: " + str(e)
        result_score = gl.eq_principle.strict_eq(non_det_2)
        try:
            score_num = float(result_score) * self.game_coeff * speed_ratio
            StorageIface(self.storage).emit().edit_game(game_id, sender_address.as_hex, int(score_num), image_link)
            StatIface(self.stat).emit().set_user_point(sender_address.as_hex, int(score_num))
            StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, game_id, sender_address.as_hex == game.get("game_creator"), game.get("game_time"), 2)
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
        game = StorageIface(self.storage).view().get_game(game_id, "")
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

def _check_speed_ratio(game: dict[str, str]) -> float:
    return 1.0 - (time.time() - float(game.get("game_time"))) / (float(game.get("game_duration")) * 60)

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
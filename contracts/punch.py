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
    game_question: str
    game_players: TreeMap[Address, Score]

    def __init__(self, game_id: str, game_creator: Address):
        self.game_id = game_id
        self.game_creator = game_creator

    def to_dict(self, time_str: str):
        if _check_time_due(self, time_str):
            return {
                "game_id": self.game_id, 
                "game_creator": self.game_creator.as_hex,
                "game_time": self.game_time,
                "game_duration": str(self.game_duration),
                "game_question": str(self.game_question), 
                "game_players": _parse_players(self.game_players, True)
            }
        return {
            "game_id": self.game_id, 
            "game_creator": self.game_creator.as_hex, 
            "game_time": self.game_time,
            "game_duration": str(self.game_duration),
            "game_question": str(self.game_question),
            "game_players": _parse_players(self.game_players, False),
            "game_time_left": str(float(self.game_time) + (self.game_duration * 60) - float(_convert_time(time_str)))
        }

class PunchLine(gl.Contract):
    game_duration: u256
    game_coeff: u256
    creator_royalty: u256
    error: str
    owner: Address
    stat: Address
    storage: Address
    active_games: TreeMap[Address, Game]

    def __init__(self, stat_contract: str, storage_contract: str):
        self.game_duration = 10
        self.game_coeff = 50
        self.creator_royalty = 10
        self.error = "None"
        self.owner = gl.message.sender_address
        self.stat = Address(stat_contract)
        self.storage = Address(storage_contract)

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
    def set_creator_royalty(self, royalty: int) -> None:
        if self.owner != gl.message.sender_address:
            raise Exception("You are not the owner")
        self.creator_royalty = royalty

    @gl.public.write
    def set_game_coeff(self, coeff: int) -> None:
        if self.owner != gl.message.sender_address:
            raise Exception("You are not the owner")
        self.game_coeff = coeff

    @gl.public.write
    def create_game(self, game_id: str, game_question: str) -> None:
        self.create_game_duration(game_id, game_question, int(self.game_duration))

    @gl.public.write
    def create_game_duration(self, potential_game_id: str, game_question: str, duration: int) -> None:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        game_archive = StorageIface(self.storage).view().get_game(potential_game_id)
        if potential_game_id == game_archive.get("game_id", ""):
            raise Exception("Game already created")
        if game_cache is not None and game_cache.game_id == potential_game_id:
            raise Exception("Game already created")
        time_str = gl.message_raw["datetime"]
        cache_active = game_cache is not None and not _check_time_due(game_cache, time_str)
        if cache_active:
            raise Exception("You have an unfinished game")
        if game_cache is not None:
            StorageIface(self.storage).emit().add_game(game_cache.to_dict(time_str))
        try:
            t = _convert_time(time_str)
            game = Game(
                game_id=potential_game_id,
                game_creator=sender_address
            )
            game.game_time = t
            game.game_duration = duration
            game.game_question = game_question
            self.active_games[sender_address] = game
            StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, potential_game_id, True, str(t), 4)
            self.error = game_question
        except Exception as e:
            self.error = "error create: " + str(e)

    @gl.public.write
    def join_game(self, game_id: str, game_answer: str) -> None:
        sender_address = gl.message.sender_address
        game_cache = next((v for k, v in self.active_games.items() if v.game_id == game_id), None)
        if game_cache is None:
            raise Exception("Game not found")
        if sender_address in game_cache.game_players:
            raise Exception("You have already played")
        if sender_address == game_cache.game_creator:
            raise Exception("Creator cannot play")
        time_str = gl.message_raw["datetime"]
        if _check_time_due(game_cache, time_str):
            raise Exception("Time is off")
        speed_ratio = _check_speed_ratio(game_cache, time_str)
        start = game_cache.game_question
        def non_det():
            return start + " " + game_answer
        ai_score = gl.eq_principle.prompt_non_comparative(
            fn=non_det, 
            task="""
Analize this text as a joke. Rate its quality, considering humor, irony, sarcasm, idioms, wordplay, and paradox. 
Rate the joke from 0 to 10, where 0 is a completely inadequate response and an unfunny joke, and 10 is a perfectly witty and funny response.
            """,
            criteria="""
The answer must be a numerical score from 0 to 10.
Consider humor, irony, sarcasm, idioms, wordplay, and paradox.
            """
        )
        try:
            score_num = float(ai_score) * float(self.game_coeff) * speed_ratio
            game_cache.game_players[sender_address] = Score(score_value=int(score_num), score_answer=game_answer)
            StatIface(self.stat).emit().add_user_points_game_to_archive(sender_address.as_hex, game_id, game_cache.game_time, 4, int(score_num))
            StatIface(self.stat).emit().add_user_points_by_game(game_cache.game_creator.as_hex, 4, int((score_num * self.creator_royalty) / 100))
            self.error = str(score_num)
        except Exception as e:
            self.error = "error answer: " + str(e)

    @gl.public.view
    def get_game_coeff(self) -> int:
        return int(self.game_coeff)

    @gl.public.view
    def get_game_duration(self) -> int:
        return int(self.game_duration)

    @gl.public.view
    def get_creator_royalty(self) -> int:
        return int(self.creator_royalty)

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

    @gl.public.view
    def get_error(self) -> str:
        return self.error

def _select_game(game: dict[str, str], nicks: dict[str, str]) -> dict:
    players = game.get("game_players", [])
    for pl in players:
        pl["nick"] = nicks.get(pl.get("address"), "")
    return game

def _check_speed_ratio(game: Game, time_str: str) -> float:
    return 1.0 - (float(_convert_time(time_str)) - float(game.game_time)) / (float(game.game_duration) * 60)

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

def _extract_json_array_from_string(s: str) -> str:
    """
    Extract a JSON array from a string.

    Args:
        s (str): The string potentially containing a JSON array.

    Returns:
        str: The extracted JSON array string, or an empty string if no valid JSON array is found.
    """
    start_index = s.find("[")
    end_index = s.rfind("]")
    if start_index != -1 and end_index != -1 and start_index < end_index:
        return s[start_index : end_index + 1]
    else:
        return ""
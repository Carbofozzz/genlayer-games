# v0.1.0
# { "Depends": "py-genlayer:latest" }
from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
from itertools import islice

@allow_storage
@dataclass
class ScoreCat:
    score_value: u256
    score_cat: str
    score_nick: str

    def to_dict(self, address: str):
        return {"score": str(self.score_value), "cat": self.score_cat, "cat_nick": self.score_nick, "address": address}

@allow_storage
@dataclass
class Contest:
    game_id: str
    game_creator: Address
    game_time: str
    game_title: str
    game_active: bool
    game_players: TreeMap[Address, ScoreCat]

    def __init__(self, game_id: str, game_creator: Address):
        self.game_id = game_id
        self.game_creator = game_creator
        self.game_active = False

    def to_dict(self):
        return {
                "game_id": self.game_id, 
                "game_creator": self.game_creator.as_hex,
                "game_time": self.game_time,
                "game_title": self.game_title,
                "game_active": str(self.game_active),
                "game_players": _parse_players(self.game_players)
            }

class CatBeautyStorage(gl.Contract):
    games: TreeMap[str, Contest]
    admins: DynArray[Address]
    owner: Address
    error: str

    def __init__(self):
        self.error = "None"
        self.owner = gl.message.sender_address
        self.admins.append(gl.message.sender_address)

    @gl.public.write
    def add_admin(self, admin_contract: str):
        try:
            if self.owner != gl.message.sender_address:
                raise Exception("You are not the owner")
            a = Address(admin_contract)
            self.admins.append(a)
        except Exception as e:
            self.error = "Add admin for '" + admin_contract + "' error: " + str(e)

    @gl.public.write
    def clear_admins(self):
        try:
            if self.owner != gl.message.sender_address:
                raise Exception("You are not the owner")
            self.admins.clear()
            self.admins.append(gl.message.sender_address)
        except Exception as e:
            self.error = "Clear admins error: " + str(e)

    @gl.public.write
    def add_game(self, game: dict) -> None:
        if gl.message.sender_address not in self.admins:
            raise Exception("You are not an admin")
        game_id = game.get("game_id")
        if game_id in self.games:
            raise Exception("Game already added")
        try:
            game_archive = Contest(
                game_id=game_id,
                game_creator=Address(game.get("game_creator"))
            )
            game_archive.game_time = game.get("game_time")
            game_archive.game_title = game.get("game_title")
            
            for p in game.get("game_players"):
                s = ScoreCat(score_value=int(p.get("score")), score_cat=p.get("cat"), score_nick=p.get("cat_nick"))
                game_archive.game_players[Address(p.get("address"))] = s
            self.games[game_id] = game_archive
            self.error = "Game added: " + game_id
        except Exception as e:
            self.error = "Add game error: " + str(e)

    @gl.public.view
    def get_game(self, game_id: str) -> dict:
        game = self.games.get(game_id)
        try:
            if game is None:
                return { "error": "Game not found" }
            return game.to_dict()
        except Exception as e:
            return { "error": str(e) }

    @gl.public.view
    def get_old_games(self, limit: u256) -> dict:
        try:
            result = []
            for k, v in sorted(self.games.items(), key=lambda kv: float(kv[1].game_time), reverse=True)[:limit]:
                result.append({ "id": v.game_id, "title": v.game_title })
            return { "contests": result }
        except Exception as e:
            return { "error": str(e) }

    @gl.public.view
    def get_admins(self) -> dict:
        try:
            if self.owner != gl.message.sender_address:
                raise Exception("You are not the owner")
            result = []
            for admin in self.admins:
                result.append({ "address": admin.as_hex })
            return { "admins": result }
        except Exception as e:
            return { "error": str(e) }

    @gl.public.view
    def get_error(self) -> str:
        return self.error

def _parse_players(players: TreeMap[Address, ScoreCat]) -> dict:
    result = []
    for address, score in players.items():
        result.append(score.to_dict(str(address.as_hex)))
    return result
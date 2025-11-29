# v0.1.0
# { "Depends": "py-genlayer:latest" }
from genlayer import *
from dataclasses import dataclass

import typing
import time

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
    game_time: float
    game_type: u256
    game_duration: float
    game_image_link: str
    game_image_desc: str
    game_players: TreeMap[Address, Score]

    def to_dict(self, admin: bool):
        if _check_time_due(self):
            return {
                "game_id": self.game_id, 
                "game_creator": self.game_creator.as_hex,
                "game_time": str(self.game_time),
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
            "game_time": str(self.game_time),
            "game_type": str(self.game_type),
            "game_duration": str(self.game_duration),
            "game_image_link": self.game_image_link, 
            "game_image_desc": desc,
            "game_time_left": str(self.game_time + (self.game_duration * 60) - time.time()),
            "game_players": _parse_players(self.game_players, False)
        }

class GuessGameStorage(gl.Contract):
    games: TreeMap[str, Game]
    admins: DynArray[Address]
    owner: Address
    error: str
    secret: str

    def __init__(self):
        self.error = "None"
        self.secret = ""
        self.owner = gl.message.sender_address
        self.admins.append(gl.message.sender_address)

    @gl.public.write
    def add_secret(self, new_secret: str):
        try:
            if self.owner != gl.message.sender_address:
                raise Exception("You are not the owner")
            self.secret = new_secret
        except Exception as e:
            self.error = "Add secret error: " + str(e)

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
    def add_game(
        self, 
        game_id: str, 
        game_creator: str,
        game_image_link: str,
        game_image_desc: str,
        game_type: int, 
        duration: int
    ) -> None:
        if gl.message.sender_address not in self.admins:
            raise Exception("You are not an admin")
        if game_id in self.games:
            raise Exception("Game already created")
        t = time.time()
        game = Game(
            game_id=game_id,
            game_creator=Address(game_creator),
            game_time=t,
            game_type=game_type,
            game_duration=float(duration),
            game_image_link=game_image_link,
            game_image_desc=game_image_desc,
            game_players=TreeMap()
        )
        self.games[game_id] = game

    @gl.public.write
    def edit_game(
        self, 
        game_id: str, 
        player: str, 
        score: int, 
        answer: str
    ) -> None:
        try: 
            if gl.message.sender_address not in self.admins:
                raise Exception("You are not an admin")
            game = self.games.get(game_id)
            player_address = Address(player)
            if game is None:
                raise Exception("Game not found")
            if player_address in game.game_players:
                raise Exception("A player has already played")
            game.game_players[player_address] = Score(
                score=score,
                answer=answer
            )
            self.error = "Edit game success: " + player + ", " + str(score)
        except Exception as e:
            self.error = "Edit game error: " + str(e) + ", " + game_id

    @gl.public.view
    def get_game(self, game_id: str, pwd: str) -> dict:
        game = self.games.get(game_id)
        try:
            if game is None:
                return { "error": "Game not found" }
            return game.to_dict(self.secret == pwd)
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

def _parse_players(players: TreeMap[Address, Score], full: bool) -> dict:
    result = []
    for address, score in players.items():
        result.append(score.to_dict(str(address.as_hex), full))
    return result

def _check_time_due(game: Game) -> bool:
    return time.time() - game.game_time >= game.game_duration * 60

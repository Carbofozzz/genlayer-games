# v0.1.0
# { "Depends": "py-genlayer:latest" }
from genlayer import *
from dataclasses import dataclass

import json
import typing
import time

@allow_storage
@dataclass
class GameArchive:
    is_creator: bool
    game_time: float
    game_id: str
    game_type: u256

    def to_dict(self):
        return {"id": self.game_id, "creator": str(self.is_creator), "game_time": str(self.game_time), "game_type": str(self.game_type)}

class UserStat(gl.Contract):
    owner: Address
    admins: DynArray[Address]
    points: TreeMap[Address, u256]
    nicknames: TreeMap[Address, str]
    games_archive: TreeMap[Address, TreeMap[str, GameArchive]]
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
    def add_user_points(self, player_address: str, point: u256) -> None:
        signer = gl.message.sender_address
        try:
            if signer not in self.admins:
                raise Exception("You are not an admin")
            pa = Address(player_address)
            if pa not in self.points:
                self.points[pa] = 0
            self.points[pa] += point
        except Exception as e:
            self.error = "Set point from '" + signer.as_hex + "' error: " + str(e)

    @gl.public.write
    def add_game_to_archive(self, player_address: str, game_id: str, is_creator: bool, game_time: str, game_type: u256) -> None:
        signer = gl.message.sender_address
        try:
            if signer not in self.admins:
                raise Exception("You are not an admin")
            self.games_archive.get_or_insert_default(Address(player_address))[game_id] = GameArchive(
                is_creator=is_creator,
                game_time=float(game_time),
                game_type=game_type,
                game_id=game_id
            )
        except Exception as e:
            self.error = "Add archive '" + signer.as_hex + "' error: " + str(e)

    @gl.public.write
    def add_user_points_game_to_archive(self, player_address: str, game_id: str, game_time: str, game_type: u256, point: u256) -> None:
        signer = gl.message.sender_address
        try:
            if signer not in self.admins:
                raise Exception("You are not an admin")
            self.games_archive.get_or_insert_default(Address(player_address))[game_id] = GameArchive(
                is_creator=False,
                game_time=float(game_time),
                game_type=game_type,
                game_id=game_id
            )
            pa = Address(player_address)
            if pa not in self.points:
                self.points[pa] = 0
            self.points[pa] += point
        except Exception as e:
            self.error = "Add archive '" + signer.as_hex + "' error: " + str(e)

    @gl.public.write
    def set_nickname(self, nick: str) -> None:
        self.nicknames[gl.message.sender_address] = truncate(nick, 25)

    @gl.public.view
    def get_player_nickname(self, player_address: str) -> str:
        try:
            return self.nicknames.get(Address(player_address), "Nick not set")
        except Exception as e:
            return "Nick address invalid"

    @gl.public.view
    def get_my_nickname(self) -> str:
        return self.get_player_nickname(gl.message.sender_address.as_hex)

    @gl.public.view
    def get_nicknames(self) -> dict:
        return {k.as_hex: v for k, v in self.nicknames.items()}

    @gl.public.view
    def get_points(self, limit: int) -> str:
        result = []
        for k, v in sorted(self.points.items(), key=lambda kv: float(kv[1]), reverse=True)[:limit]:
            result.append({ "wallet": k.as_hex, "nick": self.get_player_nickname(k.as_hex), "points": str(v) })
        return json.dumps(result)

    @gl.public.view
    def get_player_points(self, player_address: str) -> str:
        try:
            result = self.points.get(Address(player_address), 0)
            return json.dumps({ "wallet": player_address, "nick": self.get_player_nickname(player_address), "points": str(result) })
        except Exception as e:
            return json.dumps({ "error": str(e) })

    @gl.public.view
    def get_my_points(self) -> str:
        return self.get_player_points(gl.message.sender_address.as_hex)

    @gl.public.view
    def get_all_my_archive(self, limit: int) -> str:
        games = self.games_archive.get(gl.message.sender_address)
        try:
            result = [] 
            for archive in sorted(games.values(), key=lambda x: float(x.game_time), reverse=True)[:limit]:
                result.append(archive.to_dict())
            return json.dumps(result)
        except Exception as e:
            return json.dumps({ "error": str(e) })

    @gl.public.view
    def get_my_archive_by_role(self, creator: bool, limit: int) -> str:
        games = self.games_archive.get(gl.message.sender_address)
        try:
            result = [] 
            for archive in sorted(games.values(), key=lambda x: float(x.game_time), reverse=True)[:limit]:
                if archive.is_creator == creator:
                    result.append(archive.to_dict())
            return json.dumps(result)
        except Exception as e:
            return json.dumps({ "error": str(e) })

    @gl.public.view
    def get_admins(self) -> str:
        result = []
        for admin in self.admins:
            result.append({ "address": admin.as_hex })
        return json.dumps(result)

    @gl.public.view
    def get_error(self) -> str:
        return self.error

def truncate(s: str, N: int) -> str:
    return s if len(s) <= N else s[:N] + "..."
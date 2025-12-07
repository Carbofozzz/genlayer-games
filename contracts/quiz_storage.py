# v0.1.0
# { "Depends": "py-genlayer:latest" }
from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone

@allow_storage
@dataclass
class Score:
    score_value: u256
    score_answers: str

    def __init__(self, score_value: int):
        self.score_value = score_value

    def to_dict(self, address: str):
        return {"score": str(self.score_value), "answers": self.score_answers, "address": address}

@allow_storage
@dataclass
class Question:
    question_id: str
    question_task: str
    question_correct_answer: u256
    question_closed: bool
    question_answers: TreeMap[u256, str]

    def to_dict(self):
        a = []
        for k, v in self.question_answers.items():
            a.append({ "id": str(k), "answer": v })
        return {
            "id": str(self.question_id), 
            "question": str(self.question_task), 
            "correct": str(self.question_correct_answer), 
            "closed": str(self.question_closed), 
            "answers": a
        }
            

@allow_storage
@dataclass
class Game:
    game_id: str
    game_creator: Address
    game_start_time: str
    game_duration: str
    game_started: bool
    game_title: str
    game_questions: TreeMap[str, Question]
    game_milestones: TreeMap[str, str]
    game_players: TreeMap[Address, Score]

    def __init__(self, game_id: str, game_creator: Address):
        self.game_id = game_id
        self.game_creator = game_creator
        self.game_started=True

    def to_dict(self):
        return {
            "game_id": self.game_id, 
            "game_creator": self.game_creator.as_hex,
            "game_time": self.game_start_time,
            "game_finished": str(True), 
            "game_started": str(True), 
            "game_title": str(self.game_title), 
            "game_questions": _parse_questions(self.game_questions),
            "game_players": _parse_players(self.game_players)
        }

class AiQuizStorage(gl.Contract):
    games: TreeMap[str, Game]
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
            game_archive = Game(
                game_id=game_id,
                game_creator=Address(game.get("game_creator"))
            )
            game_archive.game_start_time = game.get("game_time")
            game_archive.game_duration = "0"
            game_archive.game_title = game.get("game_title")
            for q in game.get("game_questions"):
                answers = TreeMap()
                for a in q.get("answers"):
                    answers[int(a.get("id"))] = a.get("answer")
                q_a = Question(
                    question_id=q.get("id"),
                    question_task=q.get("question"), 
                    question_closed = bool(q.get("closed")),
                    question_correct_answer=int(q.get("correct")),
                    question_answers=answers
                )
                game_archive.game_questions[q.get("id")] = q_a
            for p in game.get("game_players"):
                s = Score(score_value=int(p.get("score")))
                s.score_answers=p.get("answers")
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

def _parse_questions(questions: TreeMap[str, Question]) -> dict:
    result = []
    for q_id, q in questions.items():
        result.append(q.to_dict())
    return result

def _parse_players(players: TreeMap[Address, Score]) -> dict:
    result = []
    for address, score in players.items():
        result.append(score.to_dict(str(address.as_hex)))
    return result
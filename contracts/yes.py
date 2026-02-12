# v0.1.0
# { "Depends": "py-genlayer:latest" }
from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import json

genvm_eth = gl.evm

@allow_storage
@dataclass
class Stat:
    total: u256
    passed: u256
    fast: u256

    def to_dict(self):
        return {
            "total": str(self.total),
            "passed": str(self.passed),
            "fast": str(self.fast)
        }

@allow_storage
@dataclass
class Question:
    question_ask: str
    question_answer: str

@allow_storage
@dataclass
class Game:
    game_id: str
    game_answer: str
    game_questions: TreeMap[u256, Question]
    game_active: bool
    game_resolved: bool

    def __init__(self, game_id: str, game_answer: str):
        self.game_id = game_id
        self.game_answer = game_answer
        self.game_active=True
        self.game_resolved=False

    def to_dict(self, address: str):
        questions = []
        for k, v in self.game_questions.items():
            questions.append({ "order": str(k), "user_question": v.question_ask, "master_answer": v.question_answer })
        if self.game_active:
            return {
                "id": self.game_id,
                "address": address,
                "questions": questions,
                "active": "True"
            }
        return {
            "id": self.game_id,
            "address": address,
            "answer": self.game_answer,
            "questions": questions,
            "active": "False",
            "resolved": str(self.game_resolved)
        }

class TwentyQuestions(gl.Contract):
    bridge_sender: Address
    target_chain_eid: u256
    target_contract: str
    owner: Address
    admins: DynArray[Address]
    games: TreeMap[Address, Game]
    stat: TreeMap[Address, Stat]
    global_stat: Stat
    fast_limit: u256
    last_limit: u256
    error: str

    def __init__(self, bridge_sender: str, target_chain_eid: int, target_contract: str):
        self.bridge_sender = Address(bridge_sender)
        self.target_chain_eid = u256(target_chain_eid)
        self.target_contract = target_contract
        self.owner = gl.message.sender_address
        self.admins.append(gl.message.sender_address)
        self.global_stat = Stat(total = 0, passed = 0, fast = 0)
        self.error = "None"
        self.fast_limit = 10
        self.last_limit = 19

    @gl.public.write
    def add_admin(self, admin_contract: str):
        self._only_owner()
        a = Address(admin_contract)
        self.admins.append(a)

    @gl.public.write
    def clear_admins(self):
        self._only_owner()
        self.admins.clear()
        self.admins.append(gl.message.sender_address)

    @gl.public.write
    def set_bridge_sender(self, bridge_sender: str):
        self._only_owner()
        self.bridge_sender = Address(bridge_sender)

    @gl.public.write
    def set_last_limit(self, last_limit: int):
        self._only_owner()
        if last_limit > self.fast_limit:
            self.last_limit = last_limit

    @gl.public.write
    def set_fast_limit(self, fast_limit: int):
        self._only_owner()
        if fast_limit < self.last_limit:
            self.fast_limit = fast_limit

    @gl.public.write
    def set_target(self, target_chain_eid: int, target_contract: str):
        self._only_owner()
        self.target_chain_eid = u256(target_chain_eid)
        self.target_contract = target_contract

    @gl.public.write
    def create_game(self, game_id: str, game_answer: str, creator: str):
        self._only_owner()
        try:
            game = Game(
                game_id = game_id,
                game_answer = game_answer
            )
            creator = Address(creator)
            self.games[creator] = game
            self.global_stat.total = self.global_stat.total + 1
            user_stat = self.stat.get(creator, None)
            if user_stat is None:
                user_stat = Stat(total = 0, passed = 0, fast = 0)
            user_stat.total = user_stat.total + 1
            self.stat[creator] = user_stat
        except Exception as e:
            self.error = str(e)

    @gl.public.write
    def process_bridge_message(self, message_id: str, source_chain_id: int, source_sender: str, message: bytes):
        self._only_admins()
        string_message = gl.evm.decode(str, message)
        object_message = json.loads(string_message)
        try:
            game = Game(
                game_id = str(object_message["game_id"]),
                game_answer = str(object_message["game_answer"])
            )
            creator = Address(str(object_message["game_creator"]))
            self.games[creator] = game
            self.global_stat.total = self.global_stat.total + 1
            user_stat = self.stat.get(creator, None)
            if user_stat is None:
                user_stat = Stat(total = 0, passed = 0, fast = 0)
            user_stat.total = user_stat.total + 1
            self.stat[creator] = user_stat
        except Exception as e:
            self.error = str(e)

    @gl.public.write
    def ask(self, game_id: str, question: str):
        sender_address = gl.message.sender_address
        game_cache = self.games.get(sender_address)
        if game_cache is None:
            raise Exception("You haven't created any game yet")
        if game_cache.game_id != game_id:
            raise Exception("There is no such game")
        if not game_cache.game_active:
            raise Exception("The game is over")
        if len(game_cache.game_questions) > self.last_limit:
            raise Exception("No more attempts")
        secret = game_cache.game_answer
        prompt = f"""
You are the host of a “Twenty Questions” game. You are given a secret noun in advance (the answer word), and you respond to the player who is trying to guess it. The player’s message can be either:
a question that must be answered with “yes”, “no”, or “wrong question”;
an attempt to guess the secret word itself, which must be answered with “no” or “correct”.
Your task is to respond strictly according to the following rules:
You have a variable: {secret} — this is the secret word (a noun). The player does not know it. It cannot be changed.
You receive a player message (in any language): {question}. First, determine whether it is:
a question about the properties/characteristics of the secret word; or
an attempt to name the secret word itself.
If the player is, in meaning, trying to name the word itself (making a guess), compare the guess with the correct answer:
if it matches (case-insensitive and allowing reasonable spelling/morphology variants, for example “cat” and “cats” should be treated as matching) — reply: “correct”.
if it does not match — reply: “no”.
In this case you MUST NOT say anything extra — only a single word: “correct” or “no”.
If it is not a guess but a question, decide whether you can answer it unambiguously, given the secret word:
If the question is correct, clear, and about properties of the secret word, and you can answer strictly “yes” or “no”, then reply with only one word: “yes” or “no”.
If there is not enough information in the question, or the answer depends on context, time, place, or a specific instance, and it is impossible to honestly choose an unambiguous “yes” or “no”, reply:
“wrong question”.
If the question is formulated incorrectly, is meaningless, contains several questions at once, is unrelated to the secret word, or it is impossible to understand which property is being asked about, reply:
“wrong question”.
You must not use any other response formats. For every player turn, your answer is exactly one of the four options: yes, no, correct, wrong question.
The player can ask questions or guess the word in any language. At the same time:
the secret word itself is always stored in a single fixed English spelling;
if the player names an exact translation of that word in any language, or the player’s message is an obvious trivial morphological form (singular/plural, case forms, etc. of the same language), treat this as a match (respond with “correct”).
Do not reveal the secret word until the player names it themselves. Do not give the player any hints other than the allowed one-word answers.
Always follow these rules strictly.
Return a JSON with the name as follows
{{
    "answer": str
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
                """
        def non_det() -> str:
            result = gl.nondet.exec_prompt(prompt)
            return json.loads(_extract_json_from_string(result)).get("answer", "")
        result_ai = gl.eq_principle.strict_eq(non_det)
        try:
            user_stat = self.stat.get(sender_address, None)
            if user_stat is None:
                user_stat = Stat(total = 0, passed = 0, fast = 0)
            qt = len(game_cache.game_questions)
            game_cache.game_questions[qt + 1] = Question(question_ask = question, question_answer = result_ai)
            if result_ai == "correct":
                game_cache.game_resolved = True
                game_cache.game_active = False
                if qt <= self.fast_limit:
                    self.global_stat.fast = self.global_stat.fast + 1
                    user_stat.fast = user_stat.fast + 1
                else:
                    self.global_stat.passed = self.global_stat.passed + 1
                    user_stat.passed = user_stat.passed + 1
                self.stat[sender_address] = user_stat
                # up mochi
                message = json.dumps({ "address": sender_address.as_hex, "game": game_cache.game_id, "fast": qt <= self.fast_limit, "resolved": True })
                abi = [str]
                encoder = genvm_eth.MethodEncoder("", abi, bool)
                message_bytes = encoder.encode_call([message])[4:]  # Remove method selector
                bridge_contract = gl.get_contract_at(self.bridge_sender)
                # bridge_contract.emit().send_message(self.target_chain_eid, self.target_contract, message_bytes)
            elif qt == self.last_limit:
                game_cache.game_resolved = False
                game_cache.game_active = False
                message = json.dumps({ "address": sender_address.as_hex, "game": game_cache.game_id, "fast": False, "resolved": False })
                abi = [str]
                encoder = genvm_eth.MethodEncoder("", abi, bool)
                message_bytes = encoder.encode_call([message])[4:]  # Remove method selector
                bridge_contract = gl.get_contract_at(self.bridge_sender)
                # bridge_contract.emit().send_message(self.target_chain_eid, self.target_contract, message_bytes)
            else:
                game_cache.game_resolved = False
                game_cache.game_active = True
            self.error = result_ai
        except Exception as e:
            self.error = "error answer: " + str(e)

    @gl.public.view
    def get_game(self) -> dict:
        sender_address = gl.message.sender_address
        game_cache = self.games.get(sender_address)
        try:
            if game_cache is not None:
                game = game_cache.to_dict(sender_address.as_hex)  
                return json.dumps(game)
            return json.dumps({ "error": "Game not found" })
        except Exception as e:
            return json.dumps({ "error": str(e) })

    @gl.public.view
    def get_error(self) -> str:
        return self.error

    @gl.public.view
    def get_fast_limit(self) -> str:
        return str(self.fast_limit)

    @gl.public.view
    def get_last_limit(self) -> str:
        return str(self.last_limit)

    @gl.public.view
    def get_global_stat(self) -> str:
        self._only_owner()
        return json.dumps(self.global_stat.to_dict())

    @gl.public.view
    def get_my_stat(self) -> str:
        sender_address = gl.message.sender_address
        stat = self.stat.get(sender_address, None)
        if stat is None:
            return json.dumps({ "error": "Stat not found" })
        return json.dumps(stat.to_dict())

    @gl.public.view
    def get_user_stat(self, user: str) -> str:
        sender_address = Address(user)
        stat = self.stat.get(sender_address, None)
        if stat is None:
            return json.dumps({ "error": "Stat not found" })
        return json.dumps(self.stat.to_dict())

    @gl.public.view
    def get_config(self) -> dict:
        self._only_owner()
        return {
            "bridge_sender": str(self.bridge_sender),
            "target_chain_eid": int(self.target_chain_eid),
            "target_contract": self.target_contract,
            "owner": str(self.owner),
        }

    def _only_owner(self):
        if gl.message.sender_address != self.owner:
            raise Exception("You are not the owner")

    def _only_admins(self):
        if gl.message.sender_address not in self.admins:
            raise Exception("You are not an admin")

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
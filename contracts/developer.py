# v0.1.0
# { "Depends": "py-genlayer:latest" }
from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import uuid
import random
import base64
import hashlib

@gl.contract_interface
class StatIface:
    class View:
        def get_nicknames(self) -> dict: ...
 
    class Write:
        pass

@allow_storage
@dataclass
class Score:
    score_value: u256
    score_answers: str

    def __init__(self, score_value: int):
        self.score_value = score_value

    def to_dict(self):
        return {"score": str(self.score_value), "answers": self.score_answers }

@allow_storage
@dataclass
class Question:
    question_id: str
    question_task: str
    question_correct_answer: u256
    question_answers: TreeMap[u256, str]

    def to_dict(self, admin: bool):
        a = []
        for k, v in self.question_answers.items():
            a.append({ "id": str(k), "answer": v })
        if admin:
            return {
                "id": str(self.question_id), 
                "question": str(self.question_task), 
                "correct": str(self.question_correct_answer), 
                "answers": a
            }
        return { 
            "id": str(self.question_id),
            "question": str(self.question_task),
            "answers": a
        }

@allow_storage
@dataclass
class Game:
    game_start_time: str
    game_duration: str
    game_started: bool
    game_scored: bool
    game_questions: TreeMap[str, Question]
    game_milestones: TreeMap[str, str]
    game_score: Score

    def __init__(self):
        self.game_started=False
        self.game_scored=False

    def to_dict(self, start_time: str):
        if self.game_started:
            if _check_time_active(self, start_time):
                return {
                    "game_time": self.game_start_time,
                    "game_finished": str(False), 
                    "game_started": str(True), 
                    "game_state": _render_game_state(self.game_questions, self.game_milestones, self.game_start_time, start_time)
                }
            elif self.game_scored:
                return {
                    "game_time": self.game_start_time,
                    "game_finished": str(True), 
                    "game_started": str(True), 
                    "game_questions": _parse_questions(self.game_questions, True),
                    "game_score": self.game_score.to_dict()
                }
            else:
                return {
                    "game_time": self.game_start_time,
                    "game_finished": str(True), 
                    "game_started": str(True), 
                    "game_state": { "state": "scoring" }
                }
        else:
            return { "error": "Game not started" }

class DeveloperQuiz(gl.Contract):
    game_coeff: u256
    game_qty: u256
    error: str
    secret: str
    web_link: str
    owner: Address
    stat: Address
    bridge_sender: Address
    target_chain_eid: u256
    target_contract: str
    admins: DynArray[Address]
    secrets: DynArray[str]
    active_games: TreeMap[Address, Game]

    def __init__(self, stat_contract: str):
        self.game_coeff = 50
        self.game_qty = 10
        self.error = "None"
        self.secret = ""
        self.web_link = ""
        self.owner = gl.message.sender_address
        self.admins.append(gl.message.sender_address)
        self.stat = Address(stat_contract)

    @gl.public.write
    def add_secret(self, new_secret: str):
        self._only_owner()
        self.secret = new_secret

    @gl.public.write
    def add_web_link(self, new_web_link: str):
        self._only_owner()
        self.web_link = new_web_link

    @gl.public.write
    def add_stat_contract(self, stat_contract: str) -> None:
        self._only_owner()
        self.stat = Address(stat_contract)

    @gl.public.write
    def set_game_coeff(self, coeff: int) -> None:
        self._only_owner()
        self.game_coeff = coeff

    @gl.public.write
    def set_game_qty(self, qty: int) -> None:
        self._only_owner()
        self.game_qty = qty

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
    def set_target(self, target_chain_eid: int, target_contract: str):
        self._only_owner()
        self.target_chain_eid = u256(target_chain_eid)
        self.target_contract = target_contract

    @gl.public.write
    def start_game(self) -> None:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        if game_cache is None:
            raise Exception("You have no a game to start")
        if game_cache is not None and game_cache.game_started == True:
            raise Exception("You have already started this game")
        if game_cache is not None and len(game_cache.game_questions) == 0:
            raise Exception("You have no questions this game")
        game_cache.game_start_time = _convert_time(gl.message_raw["datetime"], 30)
        game_cache.game_duration = str(_calculate_game_duration(game_cache.game_questions))
        time_result = 0
        for q_id, q in game_cache.game_questions.items():
            time_result += 20
            game_cache.game_milestones[q_id] = str(float(game_cache.game_start_time) + time_result)
        game_cache.game_started = True

    @gl.public.write
    def score_answers(self, answers: list[str]) -> None:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address, None)
        if game_cache is None:
            raise Exception("Game not found")
        if game_cache.game_started == False:
            raise Exception("Game has not started")
        if not _check_time_scoring(game_cache, gl.message_raw["datetime"]):
            raise Exception("Game are not scoring")
        if game_cache.game_scored:
            raise Exception("You have been already scored")

        decrypted = []
        for answer in answers:
            decrypted.append(self.decrypt(answer, self.secret))
        try:
            score = 0
            for d in decrypted:
                dj = json.loads(d)
                qId = dj.get("question_id")
                q = game_cache.game_questions[qId]
                q_time_end = float(game_cache.game_milestones[qId])
                aId = dj.get("answer_id")
                q_time_fact = int(dj.get("ts")) / 1000.0
                if aId == str(q.question_correct_answer):
                    if q_time_end > q_time_fact:
                        q_score = 500 * ((q_time_end - q_time_fact) / 20.0)
                        score += q_score
                    
            score_item = Score(score_value=int(score))
            score_item.score_answers = str(decrypted)
            game_cache.game_score = score_item
            game_cache.game_scored = True
            # bridge
            message = json.dumps({ "address": sender_address.as_hex, "rarity": "1" })
            if score_item.score_value > 2600:
                message = json.dumps({ "address": sender_address.as_hex, "rarity": "2" })
            if score_item.score_value > 3500:
                message = json.dumps({ "address": sender_address.as_hex, "rarity": "3" })
            if score_item.score_value > 4200:
                message = json.dumps({ "address": sender_address.as_hex, "rarity": "4" })
            if score_item.score_value > 4700:
                message = json.dumps({ "address": sender_address.as_hex, "rarity": "5" })
            abi = [str]
            encoder = genvm_eth.MethodEncoder("", abi, bool)
            message_bytes = encoder.encode_call([message])[4:]
            bridge_contract = gl.get_contract_at(self.bridge_sender)
            bridge_contract.emit().send_message(self.target_chain_eid, self.target_contract, message_bytes)
            self.error = str(score)
        except Exception as e:
            self.error = str(e)

    @gl.public.write
    def create_game(self, lang: str) -> None:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        time_str = gl.message_raw["datetime"]
        if game_cache is not None:
            raise Exception("Game already created")

        link = self.web_link
        qty = str(self.game_qty)
        rngSrc = make_rng_from_inputs(
            sender_address=sender_address,
            web_link=link,
            time_str=time_str,
        )       
        
        def leader_fn():
            web_data = gl.nondet.web.render(link, mode = "text")
            task_prompt = f"""
Find and analyze the main article on {web_data} and create {qty} quiz questions based on that article.

These should not be trivial questions, but rather interesting ones that require mental effort to answer correctly.

Output:
A JSON-array with a key-value pair of a question and answer and 3 wrong answers.
Question, answer, and wrong answers must be translated into {lang}.

Return a JSON-array with the the element fields as follows:
{{
    "question": str,
    "answer": str,
    "wrong_answer_1": str,
    "wrong_answer_2": str,
    "wrong_answer_3": str
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
            """
            result = gl.nondet.exec_prompt(task_prompt)
            return _extract_json_array_from_string(result)
            
        def check_leader_fn(tasks: dict[str, str]):
            web_data = gl.nondet.web.render(link, mode = "text")
            desc_image_prompt = f"""
Find the main article on {web_data} and check if it contains answers to questions from {tasks}.

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
            result = gl.nondet.exec_prompt(desc_image_prompt)
            return json.loads(_extract_json_from_string(result))

        def validator_fn(leader_res: gl.vm.Result) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
        
            leader_res = leader_res.calldata
            list_of_qa_dicts = json.loads(leader_res)
            qa_dict = {item["question"]: item["answer"] for item in list_of_qa_dicts}
            validator_res = check_leader_fn(qa_dict)
            
            validator_res = validator_res["result"]
        
            return validator_res
        
        quiz = gl.vm.run_nondet(leader_fn, validator_fn)
        logs = []

        def set_questions(g: Game, rng: random.Random):
            for item in json.loads(quiz):
                a_list = []
                a_list.append(item.get("answer"))
                w1 = item.get("wrong_answer_1")
                if w1:
                    a_list.append(w1)
                w2 = item.get("wrong_answer_2")
                if w2:
                    a_list.append(w2)    
                w3 = item.get("wrong_answer_3")
                if w3:
                    a_list.append(w3)
                rng.shuffle(a_list)
                answers = TreeMap()
                correct = 1
                for index, a_list_item in enumerate(a_list, start=1):
                    answers[index] = a_list_item
                    if item.get("answer") == a_list_item:
                        correct = index
                
                q = Question(
                    question_id=str(uuid.uuid1()),
                    question_task=item.get("question"), 
                    question_correct_answer=correct,
                    question_answers=answers
                )
                logs.append(q.question_id)
                g.game_questions[q.question_id] = q
        
        game = Game()
        set_questions(game, rngSrc)
        self.active_games[sender_address] = game

        self.error = str(logs)

    @gl.public.view
    def get_game_coeff(self) -> int:
        return int(self.game_coeff)

    @gl.public.view
    def get_game_qty(self) -> int:
        return int(self.game_qty)

    @gl.public.view
    def get_web_link(self) -> str:
        self._only_owner()
        return self.web_link

    @gl.public.view
    def get_my_game(self) -> dict:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        try:
            if game_cache is not None:
                game = game_cache.to_dict(gl.message_raw["datetime"])  
                nicknames = StatIface(self.stat).view().get_nicknames()
                return json.dumps(_select_game(game, nicknames, sender_address))
            return json.dumps({ "error": "Game not found" })
        except Exception as e:
            return json.dumps({ "error": str(e) })

    @gl.public.view
    def get_error(self) -> str:
        return self.error

    @gl.public.view
    def get_rating(self, limit: int) -> str:
        try:
            result = []
            nicknames = StatIface(self.stat).view().get_nicknames()
            for k, v in sorted(self.active_games.items(), key=lambda kv: float(kv[1].game_score.score_value), reverse=True)[:limit]:
                result.append({ "wallet": k.as_hex, "nick": nicknames.get(k.as_hex, ""), "stat": v.game_score.to_dict() })
            return json.dumps(result)
        except Exception as e:
            return str({ "error": str (e) })

    @gl.public.view
    def decrypt(self, token: str, password: str) -> str:
        try:
            data = base64.b64decode(token)
            if len(data) < 16:
                raise Exception("Small data")
            salt = data[:16]
            ct = data[16:]
            key = _derive_key(password, salt, rounds=5000)
            pt_bytes = bytearray(len(ct))
            for i, b in enumerate(ct):
                pt_bytes[i] = b ^ key[i % len(key)]
            return pt_bytes.decode('utf-8')
        except Exception as e:
            return str(e)

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

def _derive_key(password: str, salt: bytes, rounds: int) -> bytes:
    data = password.encode('utf-8') + salt
    h = hashlib.sha256(data).digest()
    for _ in range(rounds - 1):
        h = hashlib.sha256(h).digest()
    return h

def _select_game(game: dict[str, str], nicks: dict[str, str], address: Address) -> dict:
    game["nick"] = nicks.get(address.as_hex, "")
    game["address"] = address.as_hex
    return game

def _render_game_state(questions: TreeMap[str, Question], milestones: TreeMap[str, str], start: str, time_str: str) -> dict:
    time_passed = float(_convert_time(time_str, 0)) - float(start)
    if time_passed < 0:
        return { "state": "waiting" }
    if time_passed < _calculate_game_duration(questions):
        aq = _get_active_question(questions, milestones, time_passed)
        return { 
            "state": "quiz",
            "question": aq.get("q"),
            "finish_time": aq.get("t")
        }
    return { 
        "state": "scoring"
    }

def _parse_questions(questions: TreeMap[str, Question], admin: bool) -> dict:
    result = []
    for q_id, q in questions.items():
        result.append(q.to_dict(admin))
    return result

def _check_time_active(game: Game, start_time: str) -> bool:
    return game.game_started == True and float(_convert_time(start_time, 0)) - float(game.game_start_time) < float(game.game_duration)

def _check_time_scoring(game: Game, start_time: str) -> bool:
    score_time = float(_convert_time(start_time, 0)) - float(game.game_start_time) - float(game.game_duration) > 0 
    return _check_time_active(game, start_time) and score_time

def _calculate_game_duration(questions: TreeMap[str, Question]) -> float:
    result = 0
    for q_id, q in questions.items():
        result += 20
    return result

def make_rng_from_inputs(
    sender_address: str,
    web_link: str,
    time_str: str
) -> random.Random:
    seed_str = f"{sender_address}|{web_link}|{time_str}"
    h = hashlib.sha256(seed_str.encode("utf-8")).hexdigest()
    seed_int = int(h, 16)
    return random.Random(seed_int)

def _get_active_question(questions: TreeMap[str, Question], milestones: TreeMap[str, str], time: float) -> dict:
    result = time
    for q_id, q in questions.items():
        result -= 20
        if result < 0:
            return { "q": q.to_dict(False), "t":  milestones[q_id] }
    return {}

def _convert_time(time_str: str, gap: int) -> str:
    dt = datetime.strptime(time_str, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    return str(dt.timestamp() + gap)

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
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

    def to_dict(self, admin: bool):
        a = []
        for k, v in self.question_answers.items():
            a.append({ "id": str(k), "answer": v })
        if admin:
            return {
                "id": str(self.question_id), 
                "question": str(self.question_task), 
                "correct": str(self.question_correct_answer), 
                "closed": str(self.question_closed), 
                "answers": a
            }
        if self.question_closed:
            return { 
                "id": str(self.question_id),
                "question": str(self.question_task),
                "closed": str(self.question_closed), 
                "answers": a
            }
        return { 
            "id": str(self.question_id),
            "question": str(self.question_task),
            "closed": str(self.question_closed)
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
        self.game_started=False

    def to_dict(self, admin: bool, start_time: str):
        if self.game_started:
            if _check_time_active(self, start_time):
                return {
                    "game_id": self.game_id, 
                    "game_creator": self.game_creator.as_hex,
                    "game_time": self.game_start_time,
                    "game_finished": str(False), 
                    "game_started": str(True), 
                    "game_title": str(self.game_title), 
                    "game_players": _parse_players(self.game_players),
                    "game_state": _render_game_state(self.game_questions, self.game_milestones, self.game_start_time, start_time)
                }
            else:
                return {
                    "game_id": self.game_id, 
                    "game_creator": self.game_creator.as_hex,
                    "game_time": self.game_start_time,
                    "game_finished": str(True), 
                    "game_started": str(True), 
                    "game_title": str(self.game_title), 
                    "game_questions": _parse_questions(self.game_questions, True),
                    "game_players": _parse_players(self.game_players)
                }
        else:
            if admin:
                return {
                    "game_id": self.game_id, 
                    "game_creator": self.game_creator.as_hex,
                    "game_finished": str(False), 
                    "game_started": str(self.game_started), 
                    "game_title": str(self.game_title), 
                    "game_questions": _parse_questions(self.game_questions, True)
                }
            return { "error": "Game not found" }

class AiQuiz(gl.Contract):
    game_coeff: u256
    error: str
    secret: str
    owner: Address
    stat: Address
    storage: Address
    active_games: TreeMap[Address, Game]

    def __init__(self, stat_contract: str, storage_contract: str):
        self.game_coeff = 50
        self.error = "None"
        self.secret = ""
        self.owner = gl.message.sender_address
        self.stat = Address(stat_contract)
        self.storage = Address(storage_contract)

    @gl.public.write
    def add_secret(self, new_secret: str):
        try:
            if self.owner != gl.message.sender_address:
                raise Exception("You are not the owner")
            self.secret = new_secret
        except Exception as e:
            self.error = "Add secret error: " + str(e)

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
    def set_game_coeff(self, coeff: int) -> None:
        if self.owner != gl.message.sender_address:
            raise Exception("You are not the owner")
        self.game_coeff = coeff

    @gl.public.write
    def start_game(self, minites_to_start: int) -> None:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        if game_cache is None:
            raise Exception("You have no a game to start")
        if game_cache is not None and game_cache.game_started == True:
            raise Exception("You have already started this game")
        if game_cache is not None and len(game_cache.game_questions) == 0:
            raise Exception("You have no questions this game")
        game_cache.game_start_time = _convert_time(gl.message_raw["datetime"], minites_to_start * 60)
        game_cache.game_duration = str(_calculate_game_duration(game_cache.game_questions))
        time_result = 0
        for q_id, q in game_cache.game_questions.items():
            if q.question_closed:
                time_result += 20
            else:
                time_result += 60
            game_cache.game_milestones[q_id] = str(float(game_cache.game_start_time) + time_result)
        game_cache.game_milestones["scoring"] = str(float(game_cache.game_start_time) + time_result + 180)
        game_cache.game_started = True
        StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, game_cache.game_id, True, str(game_cache.game_start_time), 3)

    @gl.public.write
    def delete_game_questions(self, to_delete: list[str]) -> None:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        if game_cache is None:
            raise Exception("You have no a game to edit")
        if game_cache is not None and game_cache.game_started == True:
            raise Exception("You have already started this game")
        for q in to_delete:
            if q in game_cache.game_questions:
                del game_cache.game_questions[q]

    @gl.public.write
    def edit_game_questions(self, to_edit: str, ic_open: bool) -> None:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        if game_cache is None:
            raise Exception("You have no a game to edit")
        if game_cache is not None and game_cache.game_started == True:
            raise Exception("You have already started this game")
        q = game_cache.game_questions[to_edit]
        if q is not None:
            q.question_closed = not ic_open and len(q.question_answers) > 1

    @gl.public.write
    def score_answers(self, game_id: str, answers: list[str]) -> None:
        sender_address = gl.message.sender_address
        game_cache = next((v for k, v in self.active_games.items() if v.game_id == game_id), None)
        if game_cache is None:
            raise Exception("Game not found")
        if game_cache.game_started == False:
            raise Exception("Game has not started")
        if not _check_time_scoring(game_cache, gl.message_raw["datetime"]):
            raise Exception("Game are not scoring")
        if sender_address in game_cache.game_players:
            raise Exception("You have been already scored")
        if sender_address == game_cache.game_creator:
            raise Exception("Creator cannot play")

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
                if q.question_closed:
                    if aId == str(q.question_correct_answer):
                        if q_time_end > q_time_fact:
                            q_score = 500 * ((q_time_end - q_time_fact) / 20.0)
                            score += q_score
                else:
                    good = q.question_answers[q.question_correct_answer]
                    user = dj.get("answer")
                    def non_det():
                        compare_prompt = f"""
Compare these two texts—the correct one {good} and the user's answer {user}. 
Assess how closely the user's answer matches the correct one, based on text quality and semantic consistency. 
Give a consolidated rating from 0 to 10, where 0 is a completely inadequate answer and 10 is a completely identical answer.
Return a JSON with the name as follows
{{
    "rating": str,
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
                        """
                        result = gl.nondet.exec_prompt(compare_prompt)
                        return int(json.loads(_extract_json_from_string(result)).get("rating", "0"))
                    ai_score = gl.eq_principle.prompt_comparative(non_det, "The result must not differ by more than 20%")
                    if q_time_end > q_time_fact:
                        t0 = 40.0
                        t_max = 60.0
                        k_min = 0.3
                        t = q_time_end - q_time_fact
                        t_eff = min(max(t, t0), t_max)  
                        k = 1.0 - (1.0 - k_min) * ((t_eff - t0) / (t_max - t0))
                        q_score = 1000 * (ai_score / 10.0) * k
                        score += q_score
            score_item = Score(score_value=int(score))
            score_item.score_answers = str(decrypted)
            game_cache.game_players[sender_address] = score_item
            StatIface(self.stat).emit().add_user_points_game_to_archive(sender_address.as_hex, game_id, game_cache.game_start_time, 3, 0)
            self.error = str(score)
        except Exception as e:
            self.error = str(e)

    @gl.public.write
    def create_game(self, potential_game_id: str, title: str, web_link: str, qty: str, wrong_options: bool, lang: str) -> None:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        new_game = game_cache is None
        time_str = gl.message_raw["datetime"]
        cache_active = game_cache is not None and _check_time_active(game_cache, time_str)
        if cache_active:
            raise Exception("You have an unfinished game")
        if game_cache is not None and game_cache.game_started == True:
            new_game = True
            StorageIface(self.storage).emit().add_game(game_cache.to_dict(True, time_str))

        rngSrc = make_rng_from_inputs(
            sender_address=sender_address,
            potential_game_id=potential_game_id,
            title=title,
            web_link=web_link,
            time_str=time_str,
        )       
        def leader_fn():
            web_data = gl.nondet.web.render(web_link, mode = "text")
            if wrong_options:
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
            task_prompt = f"""
Find and analyze the main article on {web_data} and create {qty} quiz questions based on that article.

These should not be trivial questions, but rather interesting ones that require mental effort to answer correctly.

Output:
A JSON-array with a key-value pair of a question and answer.
Question and answer must be translated into {lang}.

Return a JSON-array with the the element fields as follows:
{{
    "question": str,
    "answer": str
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
            """
            result = gl.nondet.exec_prompt(task_prompt)
            return _extract_json_array_from_string(result)

        def check_leader_fn(tasks: dict[str, str]):
            web_data = gl.nondet.web.render(web_link, mode = "text")
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
                    question_closed = len(answers) > 1,
                    question_correct_answer=correct,
                    question_answers=answers
                )
                logs.append(q.question_id)
                g.game_questions[q.question_id] = q
        
        if not new_game:
            game_cache.game_title=title
            set_questions(game_cache, rngSrc)
        else:
            game = Game(
                game_id=potential_game_id,
                game_creator=sender_address,
            )
            game.game_title=title
            set_questions(game, rngSrc)
            self.active_games[sender_address] = game

        self.error = str(logs)

    @gl.public.view
    def get_game_coeff(self) -> int:
        return int(self.game_coeff)

    @gl.public.view
    def get_game(self, game_id: str) -> dict:
        try:
            game_cache = next((v for k, v in self.active_games.items() if v.game_id == game_id), None)
            game = StorageIface(self.storage).view().get_game(game_id)
            if game_cache is not None:
                game = game_cache.to_dict(gl.message.sender_address == game_cache.game_creator, gl.message_raw["datetime"])  
            if "error" in game:
                raise Exception(game.get("error"))
            nicknames = StatIface(self.stat).view().get_nicknames()
            return json.dumps(_select_game(game, nicknames))
        except Exception as e:
            return { "error": str(e) }

    @gl.public.view
    def get_my_game(self) -> dict:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        try:
            if game_cache is not None:
                game = game_cache.to_dict(gl.message.sender_address == game_cache.game_creator, gl.message_raw["datetime"])  
                nicknames = StatIface(self.stat).view().get_nicknames()
                return json.dumps(_select_game(game, nicknames))
            return json.dumps({ "error": "Game not found" })
        except Exception as e:
            return json.dumps({ "error": str(e) })

    @gl.public.view
    def get_error(self) -> str:
        return self.error

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

def _derive_key(password: str, salt: bytes, rounds: int) -> bytes:
    data = password.encode('utf-8') + salt
    h = hashlib.sha256(data).digest()
    for _ in range(rounds - 1):
        h = hashlib.sha256(h).digest()
    return h

def _select_game(game: dict[str, str], nicks: dict[str, str]) -> dict:
    players = game.get("game_players", [])
    for pl in players:
        pl["nick"] = nicks.get(pl.get("address"), "")
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
        "state": "scoring",
        "finish_time": milestones["scoring"]
    }

def _parse_questions(questions: TreeMap[str, Question], admin: bool) -> dict:
    result = []
    for q_id, q in questions.items():
        result.append(q.to_dict(admin))
    return result

def _parse_players(players: TreeMap[Address, Score]) -> dict:
    result = []
    for address, score in players.items():
        result.append(score.to_dict(str(address.as_hex)))
    return result

def _check_time_active(game: Game, start_time: str) -> bool:
    return game.game_started == True and float(_convert_time(start_time, 0)) - float(game.game_start_time) < float(game.game_duration) + 180

def _check_time_scoring(game: Game, start_time: str) -> bool:
    score_time = float(_convert_time(start_time, 0)) - float(game.game_start_time) - float(game.game_duration) > 0 
    return _check_time_active(game, start_time) and score_time

def _calculate_game_duration(questions: TreeMap[str, Question]) -> float:
    result = 0
    for q_id, q in questions.items():
        if q.question_closed:
            result += 20
        else:
            result += 60
    return result

def make_rng_from_inputs(sender_address: str,
                         potential_game_id: str,
                         title: str,
                         web_link: str,
                         time_str: str) -> random.Random:
    seed_str = f"{sender_address}|{potential_game_id}|{title}|{web_link}|{time_str}"
    h = hashlib.sha256(seed_str.encode("utf-8")).hexdigest()
    seed_int = int(h, 16)
    return random.Random(seed_int)

def _get_active_question(questions: TreeMap[str, Question], milestones: TreeMap[str, str], time: float) -> dict:
    result = time
    for q_id, q in questions.items():
        if q.question_closed:
            result -= 20
        else:
            result -= 60
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
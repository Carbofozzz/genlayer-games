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
        def get_old_games(self, limit: u256) -> dict: ...

    class Write:
        def add_game(self, game: dict) -> None: ...

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
    game_attempt: TreeMap[Address, u256]

    def __init__(self, game_id: str, game_creator: Address):
        self.game_id = game_id
        self.game_creator = game_creator
        self.game_active = True

    def to_dict(self):
        return {
                "game_id": self.game_id, 
                "game_creator": self.game_creator.as_hex,
                "game_time": self.game_time,
                "game_title": self.game_title,
                "game_active": str(self.game_active),
                "game_players": _parse_players(self.game_players),
                "game_attempt": str(self.game_attempt.get(gl.message.sender_address, 0))
            }

class CatBeauty(gl.Contract):
    game_coeff: u256
    error: str
    owner: Address
    stat: Address
    storage: Address
    admins: DynArray[Address]
    active_games: TreeMap[Address, Contest]

    def __init__(self, stat_contract: str, storage_contract: str):
        self.game_coeff = 50
        self.error = "None"
        self.owner = gl.message.sender_address
        self.stat = Address(stat_contract)
        self.storage = Address(storage_contract)
        self.admins.append(gl.message.sender_address)

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
    def create_contest(self, potential_id: str, title: str) -> None:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        game_archive = StorageIface(self.storage).view().get_game(potential_id)
        if potential_id == game_archive.get("game_id", ""):
            raise Exception("Game already created")
        if game_cache is not None and game_cache.game_id == potential_id:
            raise Exception("Game already created")
        if game_cache is not None:
            StorageIface(self.storage).emit().add_game(game_cache.to_dict())
        try:
            time_str = gl.message_raw["datetime"]
            t = _convert_time(time_str)
            game = Contest(
                game_id=potential_id,
                game_creator=sender_address
            )
            game.game_time=t
            game.game_title=title
            self.active_games[sender_address] = game
            StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, potential_id, True, str(t), 5)
            self.error = title
        except Exception as e:
            self.error = "error create: " + str(e)

    @gl.public.write
    def join_contest(self, game_id: str, cat: str, nick: str) -> None:
        sender_address = gl.message.sender_address
        game_cache = next((v for k, v in self.active_games.items() if v.game_id == game_id), None)
        if game_cache is None:
            raise Exception("Game not found")
        attempt = game_cache.game_attempt.get(sender_address, 0)
        if attempt == 3:
            raise Exception("Attempts run out")
        desc_image_prompt = """
Analyze the image and folow the rules described below.
You are an AI assistant that analyzes an image and returns a JSON result.

Your task:

1. First, determine if the image is a realistic photograph of a cat.
2. If it is NOT a realistic photograph of a cat (drawing, AI‑generated, toy, logo, collage, or a real photo without a cat), then:
   - "is_cat_photo": false
   - "cat_beauty_score": 0
   - "formula": "not a real cat photo"
   And STOP. Do not evaluate any criteria.
3. If it IS a realistic photograph of a cat, then:
   - "is_cat_photo": true
   - Evaluate 19 criteria (0–10 each, internally).
   - Compute block scores B1..B6 (0–10).
   - Compute R100 and then R1000 in the range 1–1000.
   - Return JSON only:
     {
       "is_cat_photo": bool,
       "cat_beauty_score": int,
       "formula": str
     }

VERY IMPORTANT:
- You MUST use the full range 0–10 for criteria and block scores.
- Do NOT cluster most normal cats around 6–8 for everything.
- Truly weak photos or low‑quality/awkward cats must get many values in the 0–4 range.
- Truly outstanding cats and photos must get many values in the 9–10 range.
- As a result, "cat_beauty_score" must meaningfully span from about 100 to 1000, not be clustered in a narrow band like 600–700.

General distribution guideline:
- Terrible photos / very unappealing results: many criteria between 0–3 → R1000 typically 50–250.
- Average phone photos of average cats: mixture of 3–7 with some 8 → R1000 typically 300–700.
- Exceptional cats and photos (wow effect): many criteria 8–10 → R1000 typically 800–1000.

ADDITIONAL CALIBRATION RULES (MANDATORY):

1) Global distribution:
- Imagine 1000 random real cat photos from the internet.
- About 5–10% must land below 250.
- About 40–60% must land between 250–600.
- About 20–40% must land between 600–800.
- Only 5–10% may be above 800.
- Only 1–2% may be above 900.

If a photo feels "typical internet nice", its R1000 MUST be around 400–650, not 700–900.
Reserve 800+ only for clearly exceptional, near‑perfect photos.

2) Penalty for clear flaws:
If any criterion description fits the 0–4 band, you MUST assign a value in 0–4, not 5–6.
When in doubt between 4 and 5, choose the lower band (0–4) if there is any noticeable problem.

Examples:
- Strong cropping of head/body → 1.1 MUST be 0–4.
- Noticeable blur or poor focus on the face → 1.3 MUST be 0–4.
- Tense or unreadable emotion → 5.1 MUST be 0–4.

3) B1 priority (framing + gaze + sharpness):
Block B1 has a strong limiting effect:
- If B1 < 4.0, R1000 MUST almost never exceed 500.
- If B1 < 3.0, R1000 MUST almost never exceed 350.
Even if the cat is very cute, you MUST respect these ceilings.

4) Anchor examples (internal, not for output):
- R1000 ≈ 150: blurry, badly cropped, messy background, weak emotion, almost no charm.
- R1000 ≈ 400: average phone photo, some flaws, cat visible and somewhat cute.
- R1000 ≈ 650: clearly good photo and cute cat, but not "wow" or studio‑level.
- R1000 ≈ 850: very strong in most blocks, clearly exceptional.
- R1000 ≈ 950: almost perfect combination of cat and photo, extremely rare.

================================
STEP 1: IS IT A REAL CAT PHOTO?
================================

Analyze the image and answer this internal question:

"Is this a realistic photograph of a real living cat?"

- Answer "False" if:
  - It is a drawing, painting, cartoon, 3D render, or AI‑generated image.
  - It is a photo of a toy, statue, logo, sticker, plush, or any non‑living cat object.
  - It is a real photo but there is no cat in the image.
- Answer "True" only if:
  - It is a realistic photograph of at least one real cat.
  - The main subject is a living cat (not just a tiny cat in the background).

If "False":
- You must output:
  {
    "is_cat_photo": false,
    "cat_beauty_score": 0,
    "formula": "not a real cat photo"
  }
Do NOT compute any other scores.

If "True":
- Continue with criteria scoring.

================================
STEP 2: CRITERIA (19 items, 0–10)
================================

Evaluate only the cat that is the main subject of the image. If there are several cats, evaluate the one that visually dominates (closer to the center, larger, in focus).

All partial scores for the criteria are in the range 0–10 (internal, do not show them separately to the user).

IMPORTANT DISTRIBUTION RULE:
- 0–2: very bad / extremely weak for this criterion.
- 3–4: below average, noticeable problems.
- 5–6: average, nothing special.
- 7–8: clearly above average, quite good.
- 9–10: outstanding, top tier, rare quality.

Do not give 6–8 to everything. A mediocre or messy photo must have multiple values in 0–4.

1. Basic criteria (photo structure):
    1.1. Full visibility of the cat (0–10):
        0–2 — only a small part of the cat is visible, or extremely cropped, shape unclear.
        3–4 — significant part is missing (only head or half body), often poorly framed.
        5–6 — cat is partially cropped, but overall shape remains understandable.
        7–8 — most of the cat fits in the frame, minor cropping only.
        9–10 — the cat fully fits into the frame; head, paws, and tail are not cropped or almost not cropped.
    1.2. Direction of gaze (0–10):
        0–2 — cat is turned away, eyes almost invisible or hidden.
        3–4 — gaze far to the side, eyes visible but not engaging.
        5–6 — gaze roughly towards the camera, but not expressive.
        7–8 — gaze near the camera direction, both eyes clearly visible.
        9–10 — the cat looks directly or almost directly into the lens, both eyes clearly visible and engaging.
    1.3. Sharpness and photo quality (0–10):
        0–2 — very heavy blur, strong noise, face is hard to recognize.
        3–4 — significant blur or low resolution; many details lost.
        5–6 — acceptable quality, cat is visible but details not sharp.
        7–8 — good quality, most fur and whiskers readable, moderate noise.
        9–10 — very clear: fur, whiskers, eyes are sharp, contours clean, noise minimal.

2. “Cat physiognomy” (face and expression):
    2.1. Face symmetry (0–10):
        0–2 — strong asymmetry not explained by perspective or breed.
        3–4 — noticeable asymmetry, slightly awkward.
        5–6 — mild asymmetry, overall acceptable.
        7–8 — generally even, small natural imperfections.
        9–10 — almost mirror symmetry, very even features.
    2.2. Expressiveness of the eyes (0–10):
        0–2 — eyes closed, hidden, or completely in deep shadow.
        3–4 — eyes visible but small, dull, no catchlights.
        5–6 — eyes visible, some expression, moderate highlights.
        7–8 — clear, bright eyes, visible emotion.
        9–10 — very expressive, large, shiny eyes with strong catchlights and clear emotion.
    2.3. “Cuteness of the smile” (0–10):
        0–2 — face looks very angry, in pain, or clearly stressed (not just a natural resting face).
        3–4 — expression rather strict or displeased without charm.
        5–6 — neutral, calm expression, not especially cute.
        7–8 — pleasant, relaxed, slightly smiling impression.
        9–10 — very cute, relaxed, “smiling” face that causes a strong “aww” reaction.
    2.4. Ears — “radar of cuteness” (0–10):
        0–2 — ears strongly pinned back or sideways, clear stress or aggression.
        3–4 — awkward or tense position, not harmonious.
        5–6 — neutral position, normal.
        7–8 — upright or slightly alert, nice silhouette.
        9–10 — perfect, harmonious ear position that emphasizes cuteness.

3. Fur, color, and “fluffiness”:
    3.1. Cleanliness and grooming of fur (0–10):
        0–2 — fur very matted, dirty, with clear tangles.
        3–4 — visible problems in several areas.
        5–6 — generally ok, but some messy parts.
        7–8 — mostly clean and well‑groomed.
        9–10 — very clean, smooth or fluffy, no visible mats, looks well‑groomed.
    3.2. Fluffiness / texture (0–10):
        0–2 — fur looks very sparse, greasy, no volume.
        3–4 — weak texture, not pleasant visually.
        5–6 — medium fluffiness, some texture.
        7–8 — clearly fluffy or with good texture.
        9–10 — very voluminous, “cloud of cat,” texture richly visible.
    3.3. Interesting coat pattern (0–10):
        0–2 — almost solid color with no expressive details, visually plain.
        3–4 — slight pattern but hardly noticeable.
        5–6 — normal pattern (spots/stripes) but not special.
        7–8 — nice, attractive pattern.
        9–10 — very bright or unique pattern: special spots, stripes, mask, etc.

4. Poses, gestures, and “acting”:
    4.1. Elegance of the pose (0–10):
        0–2 — pose unreadable, cat looks like a shapeless lump.
        3–4 — awkward, cramped, or ungraceful pose.
        5–6 — typical sitting or lying pose, normal but not special.
        7–8 — quite graceful, clear body lines.
        9–10 — very graceful, “royal” or model‑like pose.
    4.2. “Paw cuteness” (0–10):
        0–2 — paws not visible or in very awkward position.
        3–4 — paws poorly visible or uninteresting.
        5–6 — paws visible, normal.
        7–8 — cute or interesting paw position (loaf, reaching, etc.).
        9–10 — extremely cute or expressive paws; position is memorable and charming.
    4.3. Tail — “charisma indicator” (0–10):
        0–2 — tail completely invisible or cut off.
        3–4 — tail partly visible but unremarkable.
        5–6 — normal, neutral tail position.
        7–8 — nicely curved or visible, adds to silhouette.
        9–10 — very expressive, fluffy, or elegantly curved tail that adds strong charm.

5. Mood and charisma:
    5.1. Readable emotion (0–10):
        0–2 — emotion unclear, cat looks tense, stiff, or uncomfortable.
        3–4 — weak emotion, slightly tense.
        5–6 — neutral or calm mood.
        7–8 — clearly readable pleasant emotion (relaxed, curious, playful).
        9–10 — very strong, vivid emotion, easy to name and feel (playful, proud, etc.).
    5.2. “Meme potential” (0–10):
        0–2 — totally ordinary photo, nothing stands out.
        3–4 — slightly funny detail, but not really memorable.
        5–6 — some funny aspect, modest meme potential.
        7–8 — clearly funny pose/face/situation, good meme potential.
        9–10 — very strong meme potential, likely viral if shared.
    5.3. Charisma / charm (0–10):
        0–2 — almost no charm, may even cause mild negative reaction.
        3–4 — weakly charming, not very appealing.
        5–6 — typical cute cat, normal.
        7–8 — clearly charming, above average cuteness.
        9–10 — extremely charismatic “wow cat” that you want to hug and show to friends.

6. Environment and “scene”:
    6.1. Cleanliness of the background (0–10):
        0–2 — very messy, chaotic background, strong distraction.
        3–4 — noticeable clutter, cat competes with background.
        5–6 — partly cluttered, but cat remains clearly visible.
        7–8 — mostly neat, does not distract much.
        9–10 — very clean, well‑composed background that emphasizes the cat.
    6.2. Color harmony (0–10):
        0–2 — strong dissonance, unpleasant color mix, very harsh.
        3–4 — somewhat unpleasant or overloaded colors.
        5–6 — neutral palette, no strong pros or cons.
        7–8 — pleasant, harmonious colors, cat looks good in the environment.
        9–10 — exceptional color harmony, visually very pleasing.
    6.3. Interesting objects around (0–10):
        0–2 — almost empty/unclear background, no story.
        3–4 — random objects without coherent story.
        5–6 — some objects, mild sense of context.
        7–8 — clear story (box, blanket, toys, etc.).
        9–10 — very vivid and charming scene (throne‑like pillow, hat, sink, box kingdom, etc.).

================================
STEP 3: BLOCKS AND FORMULA
================================

After you have internally assigned scores from 0 to 10 for all 19 items, compute 6 blocks (each also in the 0–10 range):

B1 = avg(1.1, 1.2, 1.3)
B2 = avg(2.1, 2.2, 2.3, 2.4)
B3 = avg(3.1, 3.2, 3.3)
B4 = avg(4.1, 4.2, 4.3)
B5 = avg(5.1, 5.2, 5.3)
B6 = avg(6.1, 6.2, 6.3)

Then calculate the final rating in the range 0–100:

R100 = 0.35 * B1 + 0.20 * B2 + 0.15 * B3 + 0.10 * B4 + 0.15 * B5 + 0.05 * B6

Now convert it to a rating from 1 to 1000 (integer):

R1000 = 1 + round(R100 * 9.99)

"cat_beauty_score" MUST be:
- 0 if "is_cat_photo" is false.
- An integer from 1 to 1000 if "is_cat_photo" is true.

HARD PENALTY RULES (OVERRIDE OTHER IMPRESSIONS):

- If 1.1 (full visibility) <= 4, then:
  * B4 (poses) MUST be <= 4.0
  * B3 (fur/body) MUST be <= 6.0

- If 1.3 (sharpness) <= 4, then:
  * B1 MUST be <= 4.0
  * R1000 MUST NOT exceed 450 in any case.

- For vertically oriented, strongly cropped close-ups where paws and tail are not visible at all:
  * 1.1 MUST be in 0–4 band.
  * 4.1, 4.2, 4.3 MUST NOT exceed 4.

CRITICAL BALANCING RULE:

Even if eyes (2.2) and charisma (5.3) are 9–10, they CANNOT push R1000 above 700,
if:
- 1.1 < 5.0 OR
- 1.3 < 6.0

In such cases you MUST downscale B2 and B5 so that the final R1000 respects the ceiling.

ANCHOR EXAMPLE (similar to a close, vertical, cropped face with huge eyes):

- 1.1 = 3 (strong crop, body and paws mostly invisible)
- 1.2 = 7 (gaze near camera)
- 1.3 = 4 (noticeable blur / low detail)
- 2.2 = 9 (very expressive eyes)
- 5.3 = 8–9 (high charisma)

This kind of photo MUST result in:
- B1 around 4.0 or less
- R1000 typically between 300 and 550, NEVER above 600.

HARD GLOBAL LIMITS (FINAL CHECK BEFORE OUTPUT):

- If B1 < 4.0 then R1000 MUST NOT exceed 500.
- If B1 < 3.0 then R1000 MUST NOT exceed 350.

================================
STEP 4: OUTPUT FORMAT
================================

"formula" must be a string that reflects the final block values and calculation, for example:
Example "formula": "B1=6.0, B2=4.5, B3=7.0, B4=5.0, B5=3.5, B6=4.0, R100=4.98, R1000=498"

You must output ONLY valid JSON, no extra characters, no comments:

Return a JSON with the name as follows
{{
    "is_cat_photo": bool,
    "cat_beauty_score": int,
    "formula": str
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
                """
        def leader_fn() -> str:
            web_data = gl.nondet.web.render(cat, mode = "screenshot")
            result = gl.nondet.exec_prompt(desc_image_prompt, images=[web_data])
            return json.loads(_extract_json_from_string(result))

        def validator_fn(
            leader_score: gl.vm.Result,
        ) -> bool:
            if not isinstance(leader_score, gl.vm.Return):
                return False
            leader_res = leader_score.calldata
            validator_res = leader_fn()
            leader_score = leader_res["cat_beauty_score"]
            validator_score = validator_res["cat_beauty_score"]
            if validator_score == 0 or leader_score == 0:
                return validator_score == leader_score
            return abs(validator_score - leader_score) <= 150

        result_ai = gl.vm.run_nondet(leader_fn, validator_fn)  
        try:
            if not result_ai["is_cat_photo"]:
                raise Exception("Not a cat photo")
            s = ScoreCat(
                score_value=result_ai["cat_beauty_score"],
                score_cat=cat,
                score_nick=nick
            )
            game_cache.game_players[sender_address]=s
            game_cache.game_attempt[sender_address]= attempt + 1
            if sender_address != game_cache.game_creator:
                StatIface(self.stat).emit().add_user_points_game_to_archive(sender_address.as_hex, game_id, game_cache.game_time, 5, 0)
            self.error = str(result_ai["cat_beauty_score"])
        except Exception as e:
            self.error = str(e)

    @gl.public.view
    def get_game_coeff(self) -> int:
        return int(self.game_coeff)

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
    def get_game(self, game_id: str) -> dict:
        try:
            game_cache = next((v for k, v in self.active_games.items() if v.game_id == game_id), None)
            game = StorageIface(self.storage).view().get_game(game_id)
            if game_cache is not None:
                game = game_cache.to_dict()  
            if "error" in game:
                raise Exception(game.get("error"))
            nicknames = StatIface(self.stat).view().get_nicknames()
            return json.dumps(_select_game(game, nicknames))
        except Exception as e:
            return json.dumps({ "error": str(e) })

    @gl.public.view
    def get_active_games(self) -> dict:
        sender_address = gl.message.sender_address
        game_cache = self.active_games.get(sender_address)
        try:
            result = []
            for a, game in self.active_games.items():
                result.append({ "id": game.game_id, "title": game.game_title })
            return json.dumps({ "contests": result })
        except Exception as e:
            return json.dumps({ "error": str(e) })

    @gl.public.view
    def get_old_games(self, limit: u256) -> dict:
        return json.dumps(StorageIface(self.storage).view().get_old_games(limit))

    @gl.public.view
    def get_error(self) -> str:
        return self.error

def _select_game(game: dict[str, str], nicks: dict[str, str]) -> dict:
    players = game.get("game_players", [])
    for pl in players:
        pl["nick"] = nicks.get(pl.get("address"), "")
    return game

def _parse_players(players: TreeMap[Address, ScoreCat]) -> dict:
    result = []
    for address, score in players.items():
        result.append(score.to_dict(str(address.as_hex)))
    return result

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
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
class ScoreDog:
    score_value: u256
    score_dog: str
    score_nick: str

    def to_dict(self, address: str):
        return {"score": str(self.score_value), "dog": self.score_dog, "dog_nick": self.score_nick, "address": address}

@allow_storage
@dataclass
class Contest:
    game_id: str
    game_creator: Address
    game_time: str
    game_title: str
    game_active: bool
    game_players: TreeMap[Address, ScoreDog]

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
                "game_players": _parse_players(self.game_players)
            }

class DogBeauty(gl.Contract):
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
            StatIface(self.stat).emit().add_game_to_archive(sender_address.as_hex, potential_id, True, str(t), 6)
            self.error = title
        except Exception as e:
            self.error = "error create: " + str(e)

    @gl.public.write
    def join_contest(self, game_id: str, dog: str, nick: str) -> None:
        sender_address = gl.message.sender_address
        game_cache = next((v for k, v in self.active_games.items() if v.game_id == game_id), None)
        if game_cache is None:
            raise Exception("Game not found")
        desc_image_prompt = """
Analyze the image and folow the rules described below.
You are an AI assistant that analyzes an image and returns a JSON result.

Your task:

1. First, determine if the image is a realistic photograph of a dog.
2. If it is NOT a realistic photograph of a dog (drawing, AI‑generated, toy, logo, collage, or a real photo without a dog), then:
- "is_dog_photo": false
- "dog_beauty_score": 0
- "formula": "not a real dog photo"
And STOP. Do not evaluate any criteria.
3. If it IS a realistic photograph of a dog, then:
- "is_dog_photo": true
- Evaluate 19 criteria (0–10 each, internally).
- Compute block scores B1..B6 (0–10).
- Compute R100 and then R1000 in the range 1–1000.
- Return JSON only:
{
"is_dog_photo": bool,
"dog_beauty_score": int,
"formula": str
}

VERY IMPORTANT:
- You MUST use the full range 0–10 for criteria and block scores.
- Do NOT cluster most normal dogs around 6–8 for everything.
- Truly weak photos or low‑quality/awkward dogs must get many values in the 0–4 range.
- Truly outstanding dogs and photos must get many values in the 9–10 range.
- As a result, "dog_beauty_score" must meaningfully span from about 100 to 1000, not be clustered in a narrow band like 600–700.

General distribution guideline:
- Terrible photos / very unappealing results: many criteria between 0–3 → R1000 typically 50–250.
- Average phone photos of average dogs: mixture of 3–7 with some 8 → R1000 typically 300–700.
- Exceptional dogs and photos (wow effect): many criteria 8–10 → R1000 typically 800–1000.

ADDITIONAL CALIBRATION RULES (MANDATORY):

1) Global distribution:
- Imagine 1000 random real dog photos from the internet.
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
Even if the dog is very cute, you MUST respect these ceilings.

4) Anchor examples (internal, not for output):
- R1000 ≈ 150: blurry, badly cropped, messy background, weak emotion, almost no charm.
- R1000 ≈ 400: average phone photo, some flaws, dog visible and somewhat cute.
- R1000 ≈ 650: clearly good photo and cute dog, but not "wow" or studio‑level.
- R1000 ≈ 850: very strong in most blocks, clearly exceptional.
- R1000 ≈ 950: almost perfect combination of dog and photo, extremely rare.

================================
STEP 1: IS IT A REAL DOG PHOTO?
================================

Analyze the image and answer this internal question:

"Is this a realistic photograph of a real living dog?"

- Answer "False" if:
- It is a drawing, painting, cartoon, 3D render, or AI‑generated image.
- It is a photo of a toy, statue, logo, sticker, plush, or any non‑living dog object.
- It is a real photo but there is no dog in the image.
- Answer "True" only if:
- It is a realistic photograph of at least one real dog.
- The main subject is a living dog (not just a tiny dog in the background).

If "False":
- You must output:
{
"is_dog_photo": false,
"dog_beauty_score": 0,
"formula": "not a real dog photo"
}
Do NOT compute any other scores.

If "True":
- Continue with criteria scoring.

================================
STEP 2: CRITERIA (19 items, 0–10)
================================

Evaluate only the dog that is the main subject of the image. If there are several dogs, evaluate the one that visually dominates (closer to the center, larger, in focus).

All partial scores for the criteria are in the range 0–10 (internal, do not show them separately to the user).

IMPORTANT DISTRIBUTION RULE:
- 0–2: very bad / extremely weak for this criterion.
- 3–4: below average, noticeable problems.
- 5–6: average, nothing special.
- 7–8: clearly above average, quite good.
- 9–10: outstanding, top tier, rare quality.

Do not give 6–8 to everything. A mediocre or messy photo must have multiple values in 0–4.

1. Basic criteria (photo structure):
1.1. Full visibility of the dog (0–10):
0–2 — only a small part of the dog is visible, or extremely cropped, shape unclear.
3–4 — significant part is missing (only head or half body), often poorly framed.
5–6 — dog is partially cropped, but overall body structure remains understandable.
7–8 — most of the dog fits in the frame, minor cropping only.
9–10 — the dog fully fits into the frame; head, body, paws, and tail are not cropped or almost not cropped.

ADDITION:
A close-up head portrait (especially for large breeds) is NOT automatically a flaw for 1.1. Evaluate how clearly the main shape of the head and at least part of the neck/chest can be seen. However, as a general rule, tight vertical crops without paws and tail should still fall into the 0–4 zone if the body is almost completely absent in the frame and you cannot imagine the full silhouette of the dog.

1.2. Direction of gaze (0–10):
0–2 — dog is turned away, eyes almost invisible or hidden.
3–4 — gaze far to the side, eyes visible but not engaging.
5–6 — gaze roughly towards the camera, but not expressive.
7–8 — gaze near the camera direction, both eyes clearly visible.
9–10 — the dog looks directly or almost directly into the lens, both eyes clearly visible and engaging.
1.3. Sharpness and photo quality (0–10):
0–2 — very heavy blur, strong noise, face is hard to recognize.
3–4 — significant blur or low resolution; many details lost.
5–6 — acceptable quality, dog is visible but details not sharp.
7–8 — good quality, fur texture and facial features readable, moderate noise.
9–10 — very clear: fur, nose, eyes are sharp, contours clean, noise minimal.

2. Dog physiognomy (face and expression):
2.1. Face symmetry and proportions (0–10):
0–2 — strong asymmetry or very distorted proportions not explained by perspective or breed.
3–4 — noticeable asymmetry or slightly awkward proportions.
5–6 — mild asymmetry, overall acceptable for the breed/type.
7–8 — generally even, harmonious face, small natural imperfections.
9–10 — very harmonious, balanced, almost mirror symmetry, very attractive head type.

BREED CLARIFICATION:
For brachycephalic breeds (pug, bulldogs, etc.) a shortened muzzle, wide skull, wrinkles and a visually “squashed” face are NORMAL. Evaluate symmetry and proportions within this type: how evenly and harmoniously the eyes, nose, wrinkles and lip lines are arranged for this head format.
For bassets, spaniels, hounds, natural “sad” eyes, loose skin, and soft lip/cheek lines are not considered deformities.
Give low scores (0–4) for 2.1 only when asymmetry or strange proportions look NOT like a breed feature, but like a real deformation/injury, extremely bad angle, or strong perspective distortion.

2.2. Expressiveness of the eyes (0–10):
0–2 — eyes closed, hidden, or completely in deep shadow.
3–4 — eyes visible but small, dull, no catchlights.
5–6 — eyes visible, some expression, moderate highlights.
7–8 — clear, bright eyes, visible emotion, good catchlights.
9–10 — very expressive, “soulful” eyes with strong catchlights and clear emotion, strongly attracting attention.

2.3. Friendliness / “smile” (0–10):
0–2 — face looks clearly aggressive, in pain, or extremely stressed (not just a serious working expression).
3–4 — expression rather tense or displeased with little charm.
5–6 — neutral, calm expression, not especially cute but not negative.
7–8 — pleasant, relaxed, friendly or mildly smiling impression (soft mouth, relaxed muscles).
9–10 — very cute, joyful or affectionate “smiling” face that causes a strong “aww” reaction.

BREED EXPRESSION FEATURES:
For breeds with a “frowning” or serious default expression (pug, French bulldog, Shih Tzu, Shar Pei, Cane Corso, Rottweiler, Doberman, shepherds, etc.), a neutral, serious face SHOULD NOT be punished as “unfriendly”. If the dog is calm and shows no signs of rage/fear/pain, levels 5–6 are acceptable even without a visible “smile”.
Give 0–4 for 2.3 only if it is clear that the dog objectively feels BAD (fear, pain, strong aggression) or the expression is truly off‑putting, not just serious or breed‑gloomy.
“Smile” looks different across breeds: slight softening of the lips, soft gaze, squint, relaxed ears/muzzle can justify 7–8 even without an open mouth and visible teeth.

2.4. Ears — harmony and character (0–10):
(assess relative to the natural ear type: prick, semi‑prick, floppy, cropped, etc., and to typical expression for this breed/type)
0–2 — ears strongly show clear stress/fear (pressed tightly back), or look very uneven/damaged (not explained by known breed traits).
3–4 — awkward, asymmetrical or tense position that breaks the harmony of the head.
5–6 — neutral, typical position for the dog’s current state and breed, not adding or subtracting much charm.
7–8 — ears in a pleasant, attentive or relaxed position, create a nice silhouette, emphasize character.
9–10 — perfect, harmonious ear position that strongly enhances cuteness or nobility (playful tilt, alert pricked ears, or very charming floppy ears).

BREED AND CROPPING HANDLING:
For floppy ears (spaniels, hounds, molossers, etc.) the normal position is lying against the head or softly hanging. Do NOT lower the score just because the ears are not “upright”.
For erect ears (shepherds, spitz‑type dogs, etc.) the normal position is vertical or slightly tilted forward. Give low scores if the ears look clearly asymmetrical or abnormal for this form.
Cropped ears should be evaluated by their neatness and harmony with the head: an even, symmetrical cropped outline and natural position is 5–10 for this criterion depending on overall expressiveness.
0–4 is justified if the ears are strongly pinned back due to fear/stress, appear damaged, unevenly cropped, or clearly break the harmony of the head (for THIS dog type).

3. Fur, body, and coat pattern:
3.1. Cleanliness and grooming of coat (0–10):
0–2 — coat very dirty, matted, with clear tangles or neglected areas (not just natural outdoor dirt like a little mud on paws).
3–4 — visible problems in several areas: greasy, uneven, clearly unkempt overall.
5–6 — generally ok, but some messy or dirty parts catch the eye.
7–8 — mostly clean and well‑groomed, coat looks cared for.
9–10 — very clean, healthy coat: shiny or fluffy, no visible mats, very well‑groomed appearance.
3.2. Coat texture / volume (0–10):
(consider both smooth‑coated and long‑haired dogs relative to their natural type)
0–2 — coat looks very sparse, patchy or greasy, almost no healthy texture.
3–4 — weak texture, visually unimpressive (too flat, lifeless).
5–6 — normal coat for the type, some texture, nothing special.
7–8 — clearly pleasant texture: glossy smooth coat or nice volume for longer fur.
9–10 — outstanding texture: very voluminous, plush, or perfectly glossy, strongly enhancing visual appeal.
3.3. Interesting coat color and pattern (0–10):
0–2 — very plain color with almost no expressive markings, visually dull.
3–4 — some pattern or markings, but hardly noticeable or not very aesthetic.
5–6 — normal, typical markings (spots, mask, saddle, brindle, etc.) but not special.
7–8 — attractive, well‑defined pattern or color combination.
9–10 — very bright, unique or striking coloration/pattern (distinct mask, rare color, especially beautiful markings).

BREED COAT FEATURES:
Smooth‑coated breeds (Doberman, Boxer, Pit Bull, many terriers, etc.) should NOT be downgraded just for “lack of volume”. Evaluate cleanliness, shine, and evenness: a smooth but shiny and well‑kept coat is 7–10 for 3.2 in good light.
Long‑haired and fluffy breeds (Spitz, Collie, Shih Tzu, etc.) are evaluated on volume and structure. Slight dishevelment outdoors is acceptable, but strong matting, tangles, or dirt are grounds for 0–4 in 3.1.
For “working” and hunting dogs, some dirt/snow/splashes is allowed if it logically fits the scene (field, forest, water) and does not create an impression of neglect. In such cases, do not drop 3.1 below 5 only because of natural working condition.
Balding or partially hairless areas (if not a breed norm) reduce 3.1–3.2 into the 0–4 range, even if the rest of the dog looks normal.
CLARIFICATION:
Solid colors (black, white, red, fawn, etc.) DO NOT have to receive 0–2. If the color looks clean and works well with the eyes/background, 5–7 is fully acceptable.
Give 0–2 only when the color truly visually “disappears” (flat black shadow with no detail, extremely indistinct color) or when the combination makes the dog hard to distinguish.
Reserve 9–10 for genuinely rare, bright, or very expressive combinations (contrasting mask, excellent merle, unusually good pattern combination, etc.).

4. Poses, body language, and “acting”:
4.1. Elegance and clarity of the pose (0–10):
0–2 — pose unreadable, dog looks like a shapeless lump or very awkwardly folded, body structure unclear.
3–4 — cramped, unbalanced, or clearly ungraceful pose (weird angle, twisted body).
5–6 — typical standing, sitting or lying pose, normal but not special.
7–8 — quite graceful pose with clear body lines, good posture.
9–10 — very graceful or characterful pose (“show‑stack”, dynamic running or jumping, regal sit/stand) that looks like a model shot.
4.2. Paw cuteness / expressiveness (0–10):
0–2 — paws not visible at all or completely cut off.
3–4 — paws poorly visible or in an uninteresting/confusing position.
5–6 — paws visible, normal position.
7–8 — cute or expressive paw position (crossed paws, “begging” pose, playful step, relaxed tucked paws).
9–10 — extremely cute or memorable paw position; clearly adds charm or character (high‑five, funny sit, very elegant stance).
4.3. Tail — “charisma indicator” (0–10):
(assess according to natural tail type and cropping, if present)
0–2 — tail completely invisible or fully cut off in the frame (when it reasonably should be visible).
3–4 — tail partly visible but adds nothing to the silhouette or looks awkward.
5–6 — normal, neutral tail position, does not spoil the impression.
7–8 — nicely curved, raised, or well‑placed tail that complements the body line.
9–10 — very expressive tail: fluffy banner, joyful wag captured, or elegant curve that strongly adds to the dog’s charisma.

BREEDS, TAIL RINGS, AND CROPPING:
For breeds with a tail ring over the back (Spitz, Husky, Malamute, Akita, etc.) this position is NORMAL and can easily score 7–10 when the line is beautiful and fluffy.
For breeds with low‑carried tails, a naturally relaxed downwards tail is not a minus — this can be 5–7 if the tail is readable and does not spoil the silhouette.
A cropped tail SHOULD NOT automatically be rated 0–2. If the cropping is done neatly and the body lines look harmonious, 5–8 is normal, and use 0–4 only if the tail completely “disappears”, looks damaged, or clearly breaks the silhouette.
If the breed/type of dog usually has a minimal tail (some tailless/short‑tailed lines), evaluate the overall silhouette of the rear body and how appropriate what is visible is, rather than the tail length itself.

5. Mood and charisma:
5.1. Readable emotion (0–10):
0–2 — emotion unclear, dog looks stiff, very tense, fearful or uncomfortable.
3–4 — weak emotion, slight tension, difficult to read the state.
5–6 — neutral or calm mood, generally comfortable.
7–8 — clearly readable pleasant emotion (relaxed, curious, playful, proud, attentive).
9–10 — very strong, vivid emotion, easy to name and feel (ecstatic joy, gentle affection, energetic play, noble calm).
5.2. “Meme potential” (0–10):
0–2 — totally ordinary photo, nothing stands out.
3–4 — slightly funny detail, but not really memorable.
5–6 — some funny aspect (face, pose, situation), modest meme potential.
7–8 — clearly funny pose/face/situation (goofy ears, derpy face, silly action), good meme potential.
9–10 — very strong meme potential, likely to spread widely if shared (hilarious expression or situation).
5.3. Charisma / charm (0–10):
0–2 — almost no charm, may even cause mild negative reaction.
3–4 — weakly charming, not very appealing.
5–6 — typical nice dog, normal level of cuteness.
7–8 — clearly charming, above average cuteness or nobility; strong positive impression.
9–10 — extremely charismatic “wow dog” that you want to hug or show to friends; very strong emotional impact.

6. Environment and “scene”:
6.1. Cleanliness of the background (0–10):
0–2 — very messy, chaotic background, strong distraction from the dog.
3–4 — noticeable clutter or busy environment, dog competes with background.
5–6 — partly cluttered, but dog remains clearly visible and is the main subject.
7–8 — mostly neat, does not distract much from the dog.
9–10 — very clean, well‑composed background that emphasizes the dog (studio setup, nicely blurred nature, tidy interior).
6.2. Color harmony (0–10):
0–2 — strong dissonance, unpleasant color mix, very harsh to the eye.
3–4 — somewhat unpleasant or overloaded colors, poor combination with dog’s coat.
5–6 — neutral palette, no strong pros or cons.
7–8 — pleasant, harmonious colors, dog looks good in the environment.
9–10 — exceptional color harmony, very pleasing and “picture‑perfect” look.
6.3. Interesting objects around (0–10):
0–2 — almost empty/unclear background, no story at all.
3–4 — random objects without coherent story, slightly messy.
5–6 — some objects, mild sense of context (home, park, street).
7–8 — clear story (toys, bed, field, beach, training ground, etc.), supports the mood.
9–10 — very vivid and charming scene (throne‑like bed, costume, thematic props, playful environment) that enhances the dog’s image.

ПОРОДНЫЕ ОСОБЕННОСТИ (ОБЩЕЕ ПРАВИЛО, ОБЯЗАТЕЛЬНО УЧИТЫВАТЬ):
Во всех критериях, где речь идет о симметрии, «красоте», положении ушей, хвоста и т.п., ты ДОЛЖЕН сначала мысленно сопоставить собаку с типом породы (или похожим на нее морфотипом):
Компактные брахицефалы (мопс, французский/английский бульдог, ши-тцу, пекинес и т.п.): естественные складки, «хмурый» лоб, нависающая кожа НЕ считаются дефектами сами по себе.
Мощные молоссы/охранные породы (кане-корсо, ротвейлер, доберман, овчарки и т.п.): более серьёзное, сосредоточенное выражение НЕ должно автоматически оцениваться как «недружелюбное», если нет признаков стресса/агрессии.
Породы с грустным/задумчивым типом морды (бассет-хаунд, кокер, некоторые гончие и спаниели): «печальные» глаза и опущенные углы губ — это породная особенность, а не минус по критерию 2.3.
Породы с высоко посаженными хвостами-кольцами (шпиц, хаски, маламут, акита и т.п.): хвост над спиной или кольцом — НОРМА и не должен снижать оценку по 4.3.
Породы с естественно висящими ушами (спаниели, молоссы, многие лающие/охотничьи породы) и стоячими ушами (овчарки, шпицевые) оцениваются в критерии ушей (2.4) относительно их НОРМАЛЬНОГО типа, а не одного «универсального идеала».
Купированные уши/хвост (если купирование выполнено аккуратно и без явных повреждений) НЕ являются автоматическим минусом и оцениваются как одна из вариантов нормы для соответствующих пород.
Всегда исходи из вопроса: «Насколько эта собака гармонична и выразительна ДЛЯ СВОЕГО ТИПА/ПОРОДЫ?»

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

"dog_beauty_score" MUST be:
- 0 if "is_dog_photo" is false.
- An integer from 1 to 1000 if "is_dog_photo" is true.

HARD PENALTY RULES (OVERRIDE OTHER IMPRESSIONS):

- If 1.1 (full visibility) <= 4, then:
* B4 (poses) MUST be <= 4.0
* B3 (coat/body) MUST be <= 6.0

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
"is_dog_photo": bool,
"dog_beauty_score": int,
"formula": str
}}
It is mandatory that you respond only using the JSON format above,
nothing else. Don't include any other words or characters,
your output must be only JSON without any formatting prefix or suffix.
This result should be perfectly parsable by a JSON parser without errors.
        """
        def leader_fn() -> str:
            web_data = gl.nondet.web.render(dog, mode = "screenshot")
            result = gl.nondet.exec_prompt(desc_image_prompt, images=[web_data])
            return json.loads(_extract_json_from_string(result))

        def validator_fn(
            leader_score: gl.vm.Result,
        ) -> bool:
            if not isinstance(leader_score, gl.vm.Return):
                return False
            leader_res = leader_score.calldata
            validator_res = leader_fn()
            leader_score = leader_res["dog_beauty_score"]
            validator_score = validator_res["dog_beauty_score"]
            if validator_score == 0 or leader_score == 0:
                return validator_score == leader_score
            return abs(validator_score - leader_score) <= 150

        result_ai = gl.vm.run_nondet(leader_fn, validator_fn)  
        try:
            if not result_ai["is_dog_photo"]:
                raise Exception("Not a dog photo")
            s = ScoreDog(
                score_value=result_ai["dog_beauty_score"],
                score_dog=dog,
                score_nick=nick
            )
            game_cache.game_players[sender_address]=s
            if sender_address != game_cache.game_creator:
                StatIface(self.stat).emit().add_user_points_game_to_archive(sender_address.as_hex, game_id, game_cache.game_time, 6, 0)
            self.error = str(result_ai["dog_beauty_score"])
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

def _parse_players(players: TreeMap[Address, ScoreDog]) -> dict:
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
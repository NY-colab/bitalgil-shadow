# -*- coding: utf-8 -*-
"""
비탈길의 그림자 — 나레이션 두 트랙(나그네/요괴) 빌드 스크립트
=====================================================================
대본을 바탕으로 Typecast `cast` CLI로 음성을 생성하고, pydub로 조립해
audio/traveler.mp3(나그네), audio/yokai.mp3(요괴) 두 파일을 만든다.
공통 구간은 두 트랙 동일, 분기/한쪽전용 구간만 '같은 길이 창'으로 두어
두 음원의 전체 길이가 항상 일치한다(동시 재생 웹페이지 요구사항).

■ 준비물
  1) Typecast `cast` CLI 설치  (https://github.com/neosapience/cast)
       mac/linux:  brew install neosapience/tap/cast
       또는 릴리스의 바이너리를 PATH에 둔다.
  2) Python 패키지:  pip install pydub
  3) ffmpeg 설치 (pydub가 사용)
  4) Typecast API 키

■ 실행 (이 폴더에서)
  mac/linux:
     export TYPECAST_API_KEY=발급받은키
     python3 build_audio.py
  windows(PowerShell):
     $env:TYPECAST_API_KEY="발급받은키"
     python build_audio.py

■ 조정 (환경변수로 덮어쓰기 가능)
     VOICE_ID  보이스 ID            (기본: Gunseok, 중년 남성)
     TEMPO     말 속도 0.5~2.0       (기본: 0.9, 낮고 느리게)
     OUT_DIR   결과 mp3 폴더         (기본: ./audio)
     SEG_DIR   세그먼트 캐시 폴더     (기본: ./_audiobuild/seg)
  예) VOICE_ID=tc_xxxx TEMPO=0.95 python3 build_audio.py

■ 대본을 고쳐 다시 만들 때
  - 아래 SCRIPT의 문구만 수정한다(동일 id는 캐시되어 건너뜀).
  - 문구를 바꾼 세그먼트는 _audiobuild/seg/ 안의 해당 .wav 파일을 지우면
    다시 생성된다. (전부 새로 만들려면 _audiobuild/seg 폴더를 통째로 비운다.)
  - 분기 타이밍/효과음은 cue_slot()·count_slot()·visual_branch()·build()에서 조정.
=====================================================================
"""
import os, subprocess
from pydub import AudioSegment
from pydub.generators import Sine, WhiteNoise

HERE  = os.path.dirname(os.path.abspath(__file__))
VOICE = os.environ.get("VOICE_ID", "tc_6731b2e0855f351b98d30c48")  # Gunseok (중년 남성)
MODEL = os.environ.get("MODEL", "ssfm-v30")
TEMPO = os.environ.get("TEMPO", "0.9")                              # 낮고 느리게
SEG   = os.environ.get("SEG_DIR", os.path.join(HERE, "_audiobuild", "seg"))
OUT   = os.environ.get("OUT_DIR", os.path.join(HERE, "audio"))
os.makedirs(SEG, exist_ok=True); os.makedirs(OUT, exist_ok=True)

# ───────── 발화 대본(순서대로). 기본 smart 이모션, opts로 개별 감정/피치 지정 ─────────
W = {"emotion": "whisper", "pitch": -2}        # 귓속말(요괴 전용 코칭)
SCRIPT = [
 ("P1","해가 등성이 너머로 넘어갔습니다. 당신은 지금, 이 가파른 고갯길 앞에 선 한 사람의 나그네입니다."),
 ("P2","마을 노인이 일러주었지요. 이 고개를 넘는 무리 가운데 한 사람은, 사람이 아니라고. 사람의 탈을 쓴 요괴가 섞여 있다고 말입니다."),
 ("P3","요괴에게는 그림자가 없습니다. 걸음은 사람을 닮았으나, 어딘가 반 박자가 어긋나 있지요."),
 ("P4","고개를 돌리지 마십시오. 당신이 의지할 것은 오직 귀에 닿는 소리와, 손끝에 전해지는 떨림뿐입니다."),
 ("P5","자, 이제 오르막을 향해 섭니다. 한 줄로."),
 ("S1a","계단 맨 아래부터, 세 칸씩 사이를 두고 한 줄로 서십시오. 모두 오르막을, 위쪽만을 바라봅니다."),
 ("S1b","지금부터 게임이 끝날 때까지, 절대 뒤를 돌아보아서는 안 됩니다. 맨 앞에 선 사람은 아무도 볼 수 없고, 맨 뒤에 선 사람만이 앞선 이들의 등과 뒤통수를 지켜볼 수 있습니다."),
 ("S1c","이 어긋난 시야가, 오늘 밤 당신의 무기이자 약점입니다."),
 ("S1d","한 가지, 마음에 새기십시오. 오늘 밤 당신이 할 일은 단 하나, 이 무리에 섞인 한 명의 요괴를, 소리와 떨림만으로 가려내는 것입니다. 그리고 지금 이 순간부터, 입은 닫습니다. 목소리를 내어선 안 됩니다. 의심과 추궁은, 모든 미션이 종료된 이후에 진행해 주십시오."),
 ("S1e","준비가 되었으면, 숨을 고르십시오."),
 ("W1","요괴가 되신 걸 축하드립니다.", W),
 ("W2","오늘 밤 사람의 탈을 쓴 것은, 그대입니다.", W),
 ("W3","당황하지 마십시오. 남들과 똑같이 숨 쉬고, 똑같이 움직이는 척하십시오.", W),
 ("W4","신호가 그대에게만 늦게 닿을 것입니다. 그 어긋남을, 부디 들키지 마십시오.", W),
 ("RESUME","이제, 첫 번째 시험을 시작합니다."),
 ("A_intro","발끝에 신경을 모으십시오. 종소리가 그치면, 신호가 떨어집니다. 그 말이 들리는 순간, 망설이지 말고 움직이십시오."),
 ("A_cue","지금. 다 함께, 두 계단 위로 올라서십시오."),
 ("T_intro","좋습니다. 다음은 손끝의 차례입니다. 오른손을 들어, 중앙의 차가운 난간을 단단히 쥐십시오. 제가 세는 박자에 맞추어, 난간을 두드립니다."),
 ("C_intro","천천히, 세 번입니다."),
 ("n1","하나."),("n2","둘."),("n3","셋."),
 ("V_intro","마지막은, 눈의 차례입니다. 계단 근처에 노란색과 검은색이 엇갈리는 기둥이 서 있습니다."),
 ("V_nav","맨 뒤에서부터, 앞선 이들의 뒤통수를 하나하나 살피십시오. 누군가의 고개가, 그 기둥 쪽으로 슬며시 기울 것입니다. 그 미세한 흔들림을, 놓치지 마십시오. 당신의 고개는, 끝까지 오르막을 향합니다."),
 ("V_yok","지금, 고개를 아주 살짝, 노란검은 기둥 쪽으로 한 번 기울이십시오. 한 박자면 됩니다. 그리고 아무 일 없던 듯, 다시 오르막으로 시선을 거두십시오."),
 ("G1","잘 들으십시오. 세 가지를 떠올리십시오."),
 ("G2","신호보다 반 박자 늦게 발을 뗀 자는 누구였습니까. 난간의 마지막 떨림이 한 발 빨랐던 자는 누구였습니까. 그리고 노랗고 검은 기둥으로 고개가 기울었던 자는, 누구였습니까."),
 ("G3","셋 중 하나라도 겹치는 자가 있다면, 그자는 사람이 아닐지도 모릅니다. 허나 명심하십시오. 요괴는 그 누구보다 태연합니다."),
 ("G4","이제 삐 소리가 나면, 이 분 동안 대화할 기회를 드리겠습니다. 소리와 함께 입을 여십시오."),
 ("G5","요괴여, 그대는 거짓을 말하십시오. 나그네들이여, 그 거짓의 틈을 찾으십시오."),
 ("G6","시간은, 그리 넉넉히 드리지 않습니다."),
 ("F1","이제, 끝낼 시간입니다. 열을 세겠습니다. 마지막 하나에, 모두 몸을 돌려 서로의 얼굴을 마주 보십시오."),
 ("CD","열…… 아홉…… 여덟…… 일곱…… 여섯…… 다섯…… 넷…… 셋…… 둘…… 하나."),
 ("F3","이제, 서로의 눈을 마주한 채입니다. 숨을 멈추고, 마음을 정하십시오. 제가 셋을 세면, 요괴라 믿는 사람을 향해 손끝을 뻗으십시오."),
 ("F4","셋…… 둘…… 하나!"),
 ("F5","가장 많은 손끝이 가리킨 자. 그자가 천천히, 자신의 정체를 밝힐 것입니다. 오늘 밤, 비탈길의 그림자는…… 과연 누구의 것이었습니까."),
]

def opts(e): return e[2] if len(e) > 2 else {}

def generate_all():
    for idx, e in enumerate(SCRIPT):
        i, t = e[0], e[1]; o = opts(e)
        f = os.path.join(SEG, i + ".wav")
        if os.path.exists(f) and os.path.getsize(f) > 2000:   # 이미 있으면 건너뜀
            continue
        cmd = ["cast", t, "--voice-id", VOICE, "--model", MODEL,
               "--tempo", str(o.get("tempo", TEMPO)), "--format", "wav", "--out", f]
        emo = o.get("emotion", "smart")
        if emo == "smart":
            cmd += ["--emotion", "smart"]
            if idx > 0:             cmd += ["--prev-text", SCRIPT[idx-1][1]]
            if idx < len(SCRIPT)-1: cmd += ["--next-text", SCRIPT[idx+1][1]]
        else:
            cmd += ["--emotion", "preset", "--emotion-preset", emo]
            if "intensity" in o: cmd += ["--emotion-intensity", str(o["intensity"])]
        if "pitch" in o: cmd += ["--pitch", str(o["pitch"])]
        print("  [cast:%s] %s :: %s…" % (emo, i, t[:20]))
        subprocess.run(cmd, check=True)

# ───────── 로더 / 효과음 / 앰비언스 ─────────
def seg(i): return AudioSegment.from_wav(os.path.join(SEG, i+".wav")).set_channels(1).set_frame_rate(44100)
def pause(ms): return AudioSegment.silent(duration=ms, frame_rate=44100)
def wind(ms):
    n = WhiteNoise().to_audio_segment(duration=ms).low_pass_filter(420).apply_gain(-26)
    return n.fade_in(400).fade_out(700)
def drone(ms):
    base = Sine(55).to_audio_segment(duration=ms) - 24
    fifth = Sine(82).to_audio_segment(duration=ms) - 29
    return base.overlay(fifth).fade_in(1500).fade_out(2500)
def bell():
    t = Sine(880).to_audio_segment(duration=1500).overlay(Sine(1320).to_audio_segment(duration=1500) - 7)
    return (t - 10).fade_in(8).fade_out(1450)
def chime():
    c = pause(1500); pos = 0
    for fr in (1568, 2093, 1760):
        c = c.overlay((Sine(fr).to_audio_segment(duration=1300) - 12).fade_out(1200), position=pos); pos += 190
    return c
def drum(): return (Sine(85).to_audio_segment(duration=650) - 3).fade_out(600)
def beep(): return (Sine(1000).to_audio_segment(duration=550) - 6).fade_in(5).fade_out(60)

# ───────── 분기/한쪽전용 창 (두 트랙 동일 길이) ─────────
def whisper_branch():
    lead, tail, gap = 400, 800, 450
    block = pause(0)
    for k, wid in enumerate(["W1", "W2", "W3", "W4"]):
        block += seg(wid)
        if k < 3: block += pause(gap)
    L = lead + len(block) + tail
    nav = wind(L)                                   # 나그네: 바람 앰비언스만
    yok = wind(L).overlay(block, position=lead)     # 요괴: 앰비언스 + 귓속말
    return nav, yok
def cue_slot():
    cue = seg("A_cue"); nav_lead, yok_lead, tail = 300, 2800, 900   # 요괴 2.5초 지연
    L = max(nav_lead+len(cue), yok_lead+len(cue)) + tail
    return pause(L).overlay(cue, position=nav_lead), pause(L).overlay(cue, position=yok_lead)
def count_slot():
    ci, n1, n2, n3 = seg("C_intro"), seg("n1"), seg("n2"), seg("n3")
    s = len(ci) + 500
    nav_pos = [s, s+1200, s+2400]; yok_pos = [s, s+1200, s+1800]     # 요괴 마지막 박자 빠름
    end = max(max(p+len(c) for p,c in zip(nav_pos,[n1,n2,n3])),
              max(p+len(c) for p,c in zip(yok_pos,[n1,n2,n3])))
    L = end + 900
    def mk(pos):
        x = pause(L).overlay(ci, position=0)
        for p,c in zip(pos,[n1,n2,n3]): x = x.overlay(c, position=p)
        return x
    return mk(nav_pos), mk(yok_pos)
def visual_branch():
    lead, tail = 300, 900
    vn, vy = seg("V_nav"), seg("V_yok")
    L = lead + max(len(vn), len(vy)) + tail
    return wind(L).overlay(vn, position=lead), wind(L).overlay(vy, position=lead)

# ───────── BGM (앰비언트 드론 베드) ─────────
# 어두운 Am 드론 + 미세 떨림(tremolo) + 공간감(echo) + 바람결(brown noise).
# 두 트랙에 '동일하게' 깔아 공통 구간/동기화를 해치지 않는다.
# 구간별 음량은 shape_bed로 자동 조절: 미션 청취 구간은 작게, 내레이션·토론·클라이맥스는 크게.
BGM_LEVELS = {"narration": -14, "mission": -24, "discuss_climax": -6}  # 베드는 -20dBFS 기준 → 실제 -34/-44/-26 (수정해 톤 조절)

def _ffmpeg_bed(path, seconds):
    fc = ("[0]volume=0.22[a0];[1]volume=0.18[a1];[2]volume=0.13[a2];"
          "[3]volume=0.10[a3];[4]volume=0.08[a4];[5]volume=0.07[a5];"
          "[6]highpass=f=1200,lowpass=f=4500,volume=0.10[n];"
          "[a0][a1][a2][a3][a4][a5][n]amix=inputs=7:normalize=0:duration=longest,"
          "tremolo=f=0.1:d=0.6,aecho=0.8:0.6:340|610:0.3|0.2,"
          "highpass=f=36,lowpass=f=1600,alimiter=limit=0.9,volume=1.2")
    s = "%g" % seconds
    cmd = ["ffmpeg","-y","-v","error",
           "-f","lavfi","-i","sine=f=55:d="+s,
           "-f","lavfi","-i","sine=f=110:d="+s,
           "-f","lavfi","-i","sine=f=164.81:d="+s,
           "-f","lavfi","-i","sine=f=220:d="+s,
           "-f","lavfi","-i","sine=f=261.63:d="+s,
           "-f","lavfi","-i","sine=f=220.6:d="+s,        # 미세 디튠 → 울렁임
           "-f","lavfi","-i","anoisesrc=color=brown:d="+s+":a=0.6",
           "-filter_complex",fc,"-ar","44100","-ac","1",path]
    subprocess.run(cmd, check=True)

def make_bed(T):
    cache = os.path.join(os.path.dirname(SEG), "bed.wav")
    if not (os.path.exists(cache) and os.path.getsize(cache) > 2000):
        _ffmpeg_bed(cache, T/1000.0 + 2)
    b = AudioSegment.from_wav(cache).set_channels(1).set_frame_rate(44100)
    b = b.apply_gain(-20.0 - b.dBFS)   # 베드 RMS를 -20dBFS로 정규화(레벨 기준 통일)
    if len(b) < T: b = b + pause(T - len(b))
    return b[:T]

def shape_bed(bed, T, se
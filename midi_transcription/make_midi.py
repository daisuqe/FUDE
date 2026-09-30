"""Generate a two-hand MIDI file and a plain-text score transcription."""

from pathlib import Path
import struct


TPQ = 480
TEMPO_BPM = 96
OUTPUT_DIR = Path(__file__).resolve().parent


def n(pitches, beats):
    if isinstance(pitches, str):
        pitches = (pitches,)
    return (tuple(pitches), beats)


RIGHT_HAND = [
    [n("G4", 1), n("G4", 1), n("A4", 1), n("B4", 1)],
    [n("C5", 1), n("D5", 1), n("C5", 1), n("B4", 1)],
    [n("B4", 1), n("G4", 1), n("A4", 1), n("A4", 1)],
    [n("G4", 1), n(("D4", "G4"), 1), n(("D4", "G4"), 2)],
    [n("B4", 1.5), n("G4", 0.5), n("F#5", 1.5), n("E5", 0.5)],
    [n("G5", 0.5), n("F#5", 0.5), n("E5", 0.5), n("D5", 0.5), n("C5", 2)],
    [n("A4", 0.5), n("C5", 0.5), n("E5", 0.5), n("F#5", 0.5), n("G5", 1), n("B5", 1)],
    [n(("G5", "B5"), 4)],
    [n("B4", 1.5), n("G4", 0.5), n("F#5", 1.5), n("E5", 0.5)],
    [n("G5", 0.5), n("F#5", 0.5), n("D5", 0.5), n("E5", 0.5), n("B4", 2)],
    [n("F#5", 1.5), n("E5", 0.5), n("F#5", 1), n("A5", 1)],
    [n(("A4", "E5"), 4)],
    [n(("G5", "D6"), 1.5), n(("A5", "D6"), 0.5), n(("B5", "D6"), 1.5), n(("G5", "B5"), 0.5)],
    [n(("A5", "C6"), 1.5), n(("G5", "C6"), 0.5), n(("F#5", "C6"), 1.5), n(("F#5", "A5"), 0.5)],
    [n(("D5", "B5"), 2), n(("E5", "F#5"), 1), n(("C#5", "A5"), 1)],
    [n("D5", 4)],
    [n("B4", 1.5), n("G4", 0.5), n("F#5", 1.5), n("E5", 0.5)],
    [n("G5", 0.5), n("F#5", 0.5), n("E5", 0.5), n("D5", 0.5), n(("B4", "D5"), 2)],
    [n("F#5", 1), n("G5", 0.75), n("A5", 0.25), n("B5", 1), n("G5", 1)],
    [n("F#5", 4)],
    [n("G4", 1), n("G4", 1), n("A4", 1), n("B4", 1)],
    [n("C5", 1), n("D5", 1), n("C5", 1), n("B4", 1)],
    [n("B4", 1), n("G4", 1), n("A4", 1), n("A4", 1)],
    [n(("D4", "G4"), 4)],
]


LEFT_HAND = [
    [n("A3", 1), n("A3", 1), n("B3", 1), n("F#3", 1)],
    [n("F#3", 1), n("D3", 1), n("B2", 1), n("D3", 1)],
    [n("D3", 2), n("D3", 2)],
    [n("G2", 1), n(("G2", "B2"), 1), n(("G2", "B2"), 2)],
    [n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5), n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5)],
    [n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5), n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5)],
    [n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5), n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5)],
    [n("C3", 0.5), n("E3", 0.5), n("G3", 0.5), n("B3", 0.5), n("D4", 0.5), n("B3", 0.5), n("G3", 0.5), n("E3", 0.5)],
    [n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5), n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5)],
    [n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5), n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5)],
    [n("D3", 0.5), n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("E4", 0.5), n("C4", 0.5), n("A3", 0.5), n("F#3", 0.5)],
    [n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5), n("D3", 2)],
    [n("G3", 0.5), n("B3", 0.5), n("D4", 0.5), n("G4", 0.5), n("G3", 0.5), n("B3", 0.5), n("D4", 0.5), n("G4", 0.5)],
    [n("F#3", 0.5), n("A3", 0.5), n("D4", 0.5), n("F#4", 0.5), n("F#3", 0.5), n("A3", 0.5), n("D4", 0.5), n("F#4", 0.5)],
    [n("G3", 0.5), n("B3", 0.5), n("D4", 0.5), n("G4", 0.5), n("G3", 0.5), n("C4", 0.5), n("E4", 0.5), n("G4", 0.5)],
    [n("F#4", 0.5), n("A3", 0.5), n("D4", 0.5), n("A3", 0.5), n("F#4", 0.5), n("E4", 0.5), n("D4", 0.5), n("A3", 0.5)],
    [n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5), n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5)],
    [n("D3", 0.5), n("F#3", 0.5), n("A3", 0.5), n("F#3", 0.5), n("B2", 0.5), n("F#3", 0.5), n("A3", 0.5), n("F#3", 0.5)],
    [n("D3", 0.5), n("F#3", 0.5), n("A3", 0.5), n("F#3", 0.5), n("D3", 0.5), n("F#3", 0.5), n("A3", 0.5), n("F#3", 0.5)],
    [n("F#3", 0.5), n("A3", 0.5), n("C4", 0.5), n("A3", 0.5), n("C4", 0.5), n("D4", 0.5), n("E4", 0.5), n("F#4", 0.5)],
    [n("F#3", 1), n("F#3", 1), n("A3", 1), n("E3", 1)],
    [n("E3", 1), n("C3", 1), n("A2", 1), n("C3", 1)],
    [n("B2", 2), n("B2", 2)],
    [n("B2", 1), n("D3", 1), n("E2", 2)],
]


SEMITONES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def pitch_number(name):
    letter = name[0]
    accidental = 1 if "#" in name else (-1 if "b" in name else 0)
    octave = int(name[-1])
    return 12 * (octave + 1) + SEMITONES[letter] + accidental


def variable_length(value):
    buffer = value & 0x7F
    output = []
    while value >> 7:
        value >>= 7
        buffer <<= 8
        buffer |= (value & 0x7F) | 0x80
    while True:
        output.append(buffer & 0xFF)
        if buffer & 0x80:
            buffer >>= 8
        else:
            return bytes(output)


def meta(kind, payload):
    return bytes((0xFF, kind)) + variable_length(len(payload)) + payload


def chunk(kind, payload):
    return kind + struct.pack(">I", len(payload)) + payload


def make_conductor_track():
    micros = round(60_000_000 / TEMPO_BPM)
    data = bytearray()
    data += variable_length(0) + meta(0x03, b"Conductor")
    data += variable_length(0) + meta(0x51, micros.to_bytes(3, "big"))
    data += variable_length(0) + meta(0x58, bytes((4, 2, 24, 8)))
    data += variable_length(0) + meta(0x59, bytes((1, 0)))
    data += variable_length(0) + meta(0x2F, b"")
    return chunk(b"MTrk", data)


def make_note_track(name, measures, channel, velocity):
    events = []
    position = 0
    for measure_number, measure in enumerate(measures, 1):
        measure_ticks = 0
        for pitches, beats in measure:
            duration = round(beats * TPQ)
            for pitch in pitches:
                number = pitch_number(pitch)
                events.append((position, 1, bytes((0x90 | channel, number, velocity))))
                events.append((position + duration, 0, bytes((0x80 | channel, number, 0))))
            position += duration
            measure_ticks += duration
        if measure_ticks != 4 * TPQ:
            raise ValueError(f"{name}, measure {measure_number}: {measure_ticks} ticks")

    events.sort(key=lambda event: (event[0], event[1]))
    data = bytearray()
    data += variable_length(0) + meta(0x03, name.encode("ascii"))
    data += variable_length(0) + bytes((0xC0 | channel, 0))
    previous = 0
    for tick, _priority, message in events:
        data += variable_length(tick - previous) + message
        previous = tick
    data += variable_length(0) + meta(0x2F, b"")
    return chunk(b"MTrk", data)


def format_duration(beats):
    return {4: "w", 2: "h", 1.5: "dq", 1: "q", 0.75: "de", 0.5: "e", 0.25: "s"}[beats]


def format_measure(measure):
    parts = []
    for pitches, beats in measure:
        pitch_text = pitches[0] if len(pitches) == 1 else "[" + "+".join(pitches) + "]"
        parts.append(f"{pitch_text}:{format_duration(beats)}")
    return "  ".join(parts)


def write_text():
    lines = [
        "Sheet music transcription",
        "Time: 4/4",
        "Key signature: 1 sharp (F#)",
        f"MIDI tempo: {TEMPO_BPM} BPM",
        "Pitch notation: scientific pitch notation (middle C = C4)",
        "Durations: w=whole, h=half, q=quarter, dq=dotted quarter,",
        "           e=eighth, de=dotted eighth, s=sixteenth",
        "Chords: notes inside [ ] sound together",
        "",
        "RIGHT HAND",
    ]
    lines.extend(f"m{index:02d}  {format_measure(measure)}" for index, measure in enumerate(RIGHT_HAND, 1))
    lines += ["", "LEFT HAND"]
    lines.extend(f"m{index:02d}  {format_measure(measure)}" for index, measure in enumerate(LEFT_HAND, 1))
    (OUTPUT_DIR / "score_transcription.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    if len(RIGHT_HAND) != 24 or len(LEFT_HAND) != 24:
        raise ValueError("Expected 24 measures in each hand")
    header = chunk(b"MThd", struct.pack(">HHH", 1, 3, TPQ))
    midi = header + make_conductor_track()
    midi += make_note_track("Right Hand", RIGHT_HAND, channel=0, velocity=84)
    midi += make_note_track("Left Hand", LEFT_HAND, channel=1, velocity=70)
    (OUTPUT_DIR / "score_transcription.mid").write_bytes(midi)
    write_text()
    print("Wrote score_transcription.mid and score_transcription.txt")


if __name__ == "__main__":
    main()

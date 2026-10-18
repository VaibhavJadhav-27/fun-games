# Party Games — Product Spec

Real-time multiplayer party games for a group of friends, played in the browser on phones. No accounts, no install: one person creates a room, shares a link, and everyone joins with just a name.

v1 games: **Imposter**, **Traitor**, **Pictionary**.

---

## 1. Goals and non-goals

**Goals (v1)**
- Create a room → pick a game → share a link → friends join with a name → play. The first game starts in under a minute.
- Works well on mobile browsers (portrait, one hand). Desktop is supported, not the priority.
- Designed for **in-person play first** (office or a room of friends). The app replaces paper chits, timers, voting and scoring; discussion happens out loud.
- Every player sees **only their own secret information**. This is enforced on the server.
- Survives phone locks, refreshes and flaky Wi-Fi: a player rejoins their seat automatically.

**Non-goals (v1)**
- User accounts, login, friends lists, profiles.
- Persistent history or leaderboards across sessions.
- Public matchmaking or rooms with strangers.
- Voice or video.
- Native mobile apps.

**Optional for v1, if time allows**
- In-room text chat for remote play. It's off by default, and the host can enable it in the lobby.

---

## 2. Core flow

### 2.1 Create a room
1. The landing page has a big **Create room** button and a **Join with code** input.
2. The host enters their display name and creates the room.
3. The host picks a game: Imposter, Traitor or Pictionary. They can change it in the lobby until the game starts.
4. The room gets a short code (4 uppercase letters, avoiding ambiguous characters like O/0 and I/1) and a link: `/r/<CODE>`.
5. The lobby shows the link with **Copy** and **Share** buttons (Web Share API on mobile), plus a QR code.

### 2.2 Join a room
1. A friend opens `/r/<CODE>`, or enters the code on the landing page.
2. They enter a display name. It's required, 1–16 characters, and unique within the room; if it's taken, they're asked to pick another.
3. They land in the lobby and see the player list update live.
4. Joining is blocked while a game is in progress. The player can wait in the lobby and is included in the next game.

### 2.3 Lobby
- Shows the selected game, its short rules, and its settings (host-editable, read-only for others).
- Shows the player list, with the host marked.
- The host can **kick** a player.
- The host taps **Start** once the minimum player count for the selected game is met. Otherwise Start is disabled with a reason ("Need 2 more players").

### 2.4 After a game
- A results screen shows the winner, every role revealed, and scores where relevant.
- The host can choose **Play again** (same game, same players), **Change game** (back to the lobby), or **Close room**.

### 2.5 Room rules
- Max 15 players per room.
- The host is the room creator. If the host disconnects for more than 60 seconds, host passes to the longest-connected player.
- A room expires after 30 minutes with no connected players, or 3 hours total.
- **Reconnection:** on join, the client gets a session token stored in localStorage. Reopening the link with that token restores the same player, seat and role, mid-game included.
- A disconnected player stays in the game, shown as "away". Game rules for away players are defined per game below.

---

## 3. Games

Each game is a sequence of **phases**. Every phase has a clear owner of the next action, and most have a timer. When a timer runs out, the phase advances with a sensible default, so the game never stalls waiting for one person.

### 3.1 Imposter

**Players:** 3–12.

**Setup**
- The server picks a secret word from the selected **word pack** (e.g. General, Food, Movies, Places, Office). Packs are plain data files.
- One random player is the **imposter**. Every other player is a **crewmate**.
- Crewmates' screens show the word. The imposter's screen shows **"You are the IMPOSTER"** and the word pack's category name only (e.g. "Food"), no word.
- Setting: number of imposters, default 1 (allow 2 when there are 8+ players).

**Round loop**
1. **Clue phase.** A random player order is shown. Going in order, each player says one word that relates to the secret word.
   - In-person mode: the app just highlights whose turn it is. The current player taps **Done** (or the host taps Next). 20-second soft timer per player.
   - Remote mode (chat on): each player types their one-word clue; clues appear in a shared list.
2. **Discussion phase.** A 90-second timer (configurable from 30–300 seconds). The host can end it early.
3. **Vote phase.** Each player secretly votes for who they think is the imposter. Players can't vote for themselves; skipping is allowed. 30-second timer; no vote counts as a skip.
4. **Reveal.**
   - The player with the most votes is voted out, and their role is revealed.
   - A tie, or skip winning, means nobody is voted out, and play moves to the next round.
   - If the imposter is voted out, they get one **last-chance guess**: they type the secret word (30 seconds). A correct guess (case-insensitive, trimmed) means the imposter wins. Otherwise crewmates win.
   - If a crewmate is voted out, the game continues with the remaining players.

**Win conditions**
- Crewmates win: the imposter is voted out and fails the last-chance guess.
- Imposter wins: they guess the word correctly, OR survive until only 2 players remain (themselves + 1), OR survive the configured max rounds (default 3).

**Scoring (optional, per game)**
- Crewmates win: each crewmate +1.
- Imposter wins: imposter +3.

### 3.2 Traitor

**Players:** 5–15.

**Roles**
- **Traitors:** by default 1 traitor for 5–6 players, 2 for 7–11, and 3 for 12–15. The host can override this, within 1 to floor((players − 1) / 3).
- **Civilians:** everyone else.
- Traitors see their role **and the names of the other traitors**. Civilians see only "Civilian".

**Round loop**
1. **Night phase.** Everyone's screen goes dark ("Night — close your eyes" when in person).
   - Traitors see a list of living civilians and each pick a target.
   - The kill happens only when **all living traitors pick the same target** (unanimous). Traitors can see each other's current picks live, so they can converge.
   - 60-second timer. If there's no unanimous choice when time runs out, **nobody is killed** this night.
   - Civilians see a neutral waiting screen. It must look identical for everyone and stay up for the same duration, so nobody can tell who is a traitor by watching phones.
2. **Morning.** The victim is announced (or "Nobody was killed"). The victim becomes a **spectator**: they can watch but not speak or vote. A setting controls whether the victim's role is revealed (default: no, since victims are always civilians).
3. **Day discussion.** 120-second timer (configurable); the host can end it early.
4. **Day vote.** Every living player votes to banish someone, or skips. 45-second timer.
   - The most votes means that player is banished, and their role is revealed (default on, configurable).
   - A tie, or skip winning, means nobody is banished.
5. Check the win conditions, then loop back to Night.

**Win conditions** (checked after every night and every day vote)
- **Civilians win:** all traitors are banished.
- **Traitors win:** living traitors ≥ living civilians.

**Away players:** a disconnected player's vote counts as skip. A disconnected traitor is excluded from the unanimity requirement after 15 seconds away, so the night isn't blocked.

### 3.3 Pictionary

**Players:** 3–12.

**Setup**
- Settings: rounds (default 2; one round = every player draws once), draw time (default 80 seconds, range 30–180), word pack.

**Turn loop**
1. **Word choice.** The drawer sees 3 random words from the pack and picks one (10 seconds; auto-picks the first one when time runs out). Nobody else sees the options.
2. **Drawing phase.**
   - The drawer gets a canvas: pen, 2–3 sizes, about 8 colours, eraser, undo, clear.
   - Strokes stream live to all other players' screens.
   - Guessers see the canvas, plus a hint line of blanks (`_ _ _ _ _   _ _ _`). One random letter is revealed at 50% of the time and another at 75%.
   - Guessers type guesses. Matching is case-insensitive, ignores extra spaces, and accepts a word with one character off as "close" (shown to that guesser only as "So close!").
   - A correct guess is **not** shown to others. Others see only "<Name> guessed it!". After guessing correctly, a player can no longer guess and sees the word.
   - In-person mode: guessers can also shout answers. The drawer can then tap a player's name to award them the guess manually.
3. **Turn end.** This happens when everyone has guessed or the timer runs out. The word is revealed to all, and the turn's scores are shown.

**Scoring**
- Guesser: points based on speed, from 100 at the start down to 20 at the end, decreasing linearly.
- Drawer: +25 for each player who guessed correctly.
- The final leaderboard comes after the last round.

**Away players:** a disconnected drawer's turn is skipped. Away guessers simply don't score.

---

## 4. Visibility rules (server-enforced)

The server must never send a player data they shouldn't see. Each game produces a **per-player view** of the state. No client receives the full state.

| Data | Who receives it |
| --- | --- |
| Imposter: the secret word | Crewmates only (and everyone at the reveal) |
| Imposter: who the imposter is | Nobody until the reveal |
| Traitor: each player's role | That player only; traitors also get the other traitors' names |
| Traitor: night picks | Living traitors only |
| Votes in progress | Nobody (only "X of Y voted"); the final tally is shown at the reveal |
| Pictionary: word options | Drawer only |
| Pictionary: chosen word | Drawer, plus each guesser after they guess correctly |
| Pictionary: correct guess text | Server only; others see "<Name> guessed it!" |

Client-side hiding is never acceptable. If it's in the network payload, it counts as visible.

---

## 5. Content

- Word packs live in `packages/shared` (or a `content/` folder) as JSON: `{ id, name, category, words[] }`.
- v1 ships with 5 packs of 100+ words each: General, Food, Places, Movies & TV, Office.
- All words are family-friendly by default.

---

## 6. Non-functional requirements

- **Mobile-first:** usable at 360px width, large tap targets (44px+), no horizontal scroll.
- **Latency:** game actions reflect on other screens in under 300ms on a normal connection. Pictionary strokes should feel live (batch points every ~50ms).
- **Robustness:** the server validates every action: is it this player's turn, is the phase correct, is the target valid. Invalid actions are rejected with an error and never crash the room.
- **Timers are server-side.** Clients only display the countdown from a server-provided deadline.
- **No database in v1.** Rooms live in memory. A server restart ends active games, which is acceptable for v1.
- **Privacy:** store no personal data beyond the display name for the room's lifetime. No analytics in v1.

---

## 7. Open questions (decide before or during M2)

1. Primarily in-person or remote? *Default assumption: in-person first, chat as an optional toggle.*
2. Imposter: should the imposter see the category, or nothing at all? *Default: the category.*
3. Traitor: reveal the role on banishment? *Default: yes.*
4. Do we need custom word lists entered by the host? *Default: not in v1.*
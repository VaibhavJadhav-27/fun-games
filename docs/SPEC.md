# Party Games — Product Spec

Real-time multiplayer party games for a group of friends, played in the browser on phones. No accounts, no install: one person creates a room, shares a link, and everyone joins with just a name.

v1 games: **Imposter**, **Traitor**, **Pictionary**.

---

## 1. Goals and non-goals

**Goals (v1)**
- Create a room → pick a game → share a link → friends join with a name → play. The first game starts in under a minute.
- Works well on mobile browsers (portrait, one hand). Desktop is supported, not the priority.
- Designed for **in-person play** (office or a room of friends). The app replaces paper chits, voting and scoring; discussion happens out loud, at the group's own pace.
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
4. A player who joins while a game is in progress can't enter that game. They wait in the room ("You'll join the next game") and are included in the next game.

### 2.3 Lobby
- The host sets up in two steps. **Step 1:** Invite friends, Pick a game, and the player list, with a **Next** button. **Step 2:** the selected game's settings, with **Back** and **Start**.
- Everyone else sees one screen: the selected game, its short rules, its settings (read-only), and the player list.
- Shows the player list, with the host marked.
- The host can **kick** a player.
- The host taps **Start** once the minimum player count for the selected game is met. Otherwise Start is disabled with a reason ("Need 2 more players").

### 2.4 During a game (host controls)
- The host drives the pace: they decide when discussion is over and tap **Start voting** (see §3).
- The host can **End game** at any time (with a confirm dialog). The game stops immediately and goes to the results screen with every role revealed and no winner ("Ended by host").

### 2.5 After a game
- A results screen shows the winner (or "Ended by host"), every role revealed, and scores where relevant.
- The host can choose **Play again** (same game, same settings, same players plus anyone who was waiting), **Change game** (back to the lobby), or **Close room**.

### 2.6 Room rules
- Max 15 players per room.
- The host is the room creator. If the host disconnects for more than 60 seconds, host passes to the longest-connected player.
- A room expires after 30 minutes with no connected players, or 3 hours total.
- **Reconnection:** on join, the client gets a session token stored in localStorage. Reopening the link with that token restores the same player, seat and role, mid-game included.
- **Lost token** (e.g. the link was opened in an in-app browser, then in Chrome): the player joins with a new name as a waiting player, and the host can tap an away player and choose **Give this seat to <new name>**. Seats can't be claimed by typing an old name.
- A disconnected player stays in the game, shown as "away". Game rules for away players are defined per game below.

---

## 3. Games

Each game is a sequence of **phases**. Because everyone is in the same room, **discussion and turns are untimed**: the group talks for as long as it likes. The only timers are where the app must collect secret input from everyone: **voting (60 seconds)**, the Imposter's last-chance guess, and a safety cap on the Traitor night.

So the game never stalls, every untimed phase has a host control to move on (**Start voting**, **Continue**, **Skip turn**, **End game**).

### Shared: voting (Imposter and Traitor)
- The host taps **Start voting**. A **60-second** timer starts, and every eligible player's **Vote** buttons become active.
- Each player's screen lists every eligible candidate's name with a **live vote count** next to it, updated in real time on every screen ("Ravi · 3"). A **Skip** option shows its count too.
- A player votes by tapping a name (not their own) or **Skip**. They can change their vote while the vote is open.
- **Counts only while voting:** nobody can see *who* voted for whom until the result.
- The vote closes as soon as **every eligible player has voted**, or when the **60 seconds** run out, whichever comes first. Missing votes count as skip; away players count as skip.
- **Result screen:** the final count per name, who voted for whom, and the outcome:
  - The player with the most votes is **evicted** and their role is revealed: **"Imposter caught!"** / **"Traitor caught!"** or **"<Name> was innocent"**.
  - A tie, or Skip winning, means **nobody is evicted**.
- **An evicted player is out for the rest of that game:** they can't vote or act in any later round. They stay in the room as a spectator, and they play again normally in the next game.

### 3.1 Imposter

**Players:** 3–12.

**Setup**
- Settings: **word source**, either genres (multi-select, at least one, from Fruits & Vegetables, Animals, Everyday Objects, Places, Food & Drinks, Office, Random Words) or **Custom word**; **difficulty** (Easy / Medium / Hard / Mixed, default Medium; genres only); number of imposters (default 1; 2 allowed with 8+ players); max rounds (default 3).
- With genres, the server picks one secret word from the selected genres and difficulty.
- With **Custom word**, the host types the word (1–30 letters, numbers or spaces). The host then **moderates**: they see the word and keep every host control, but get no role, can't vote, and aren't counted towards the player count. The word is never sent to anyone else's device until the results. It's used for one game only and is cleared after it, or if the host changes.
- One random player (or two) is the **imposter**. Every other player is a **crewmate**.
- Crewmates' screens show the word. The imposter's screen shows **"You are the IMPOSTER"** and no word. **Only on Easy** with a genre word does the imposter also see the genre name (e.g. "Fruits") as a hint; on Medium, Hard, Mixed or a custom word they get no hint. With 2 imposters, each also sees the other imposter's name. The moderator's screen shows the word only, not who the imposters are.

**Round loop**
1. **Discussion (untimed, no app turns).** The group goes round robin out loud on its own: each player says a word or hint related to the secret word, then everyone discusses. The app just shows the player's role card and the list of players still in. When the group is ready, the host taps **Start voting**.
2. **Vote (up to 60 seconds).** See *Shared: voting*: live counts per name, closes when everyone has voted or at 60 seconds.
3. **Result.**
   - **"Imposter caught!"**: the imposter gets one **last-chance guess**: they type the secret word (30 seconds). A correct guess (case-insensitive, trimmed) means the imposters win. Otherwise that imposter is out.
   - **"<Name> was innocent"**: the crewmate is evicted, and the game continues with the remaining players.
   - **Nobody evicted** (tie or Skip): the game continues.
   - The host taps **Continue** to start the next round, which keeps the same word.

**Win conditions**
- Crewmates win: every imposter has been evicted and failed their last-chance guess.
- Imposters win: any imposter guesses the word correctly, OR living imposters ≥ living crewmates, OR the imposters survive the max rounds.

**Scoring (optional, per game)**
- Crewmates win: each crewmate +1.
- Imposters win: each imposter +3.

**Away players:** their vote counts as skip. An away imposter at the last-chance guess fails when the 30 seconds run out.

### 3.2 Traitor

**Players:** 5–15.

**Roles**
- **Traitors:** by default 1 traitor for 5–6 players, 2 for 7–11, and 3 for 12–15. The host can override this, within 1 to floor((players − 1) / 3).
- **Civilians:** everyone else.
- Traitors see their role **and the names of the other traitors**. Civilians see only "Civilian".

**Round loop**
1. **Night.** Everyone's screen goes dark ("Night — close your eyes").
   - Traitors see a list of living civilians. Each traitor picks a target and taps **Lock**. Traitors can see each other's current picks live, so they can converge.
   - The night **ends as soon as every living traitor has locked the same target**, and that player is killed.
   - Safety cap: if there's no unanimous lock after 60 seconds, the night ends with **nobody killed**.
   - Civilians see a neutral waiting screen. It must look identical for every non-traitor, so nobody can tell who is a traitor by watching phones.
2. **Morning.** The victim is announced (or "Nobody was killed"). The victim is evicted and becomes a spectator. A setting controls whether the victim's role is revealed (default: no, since victims are always civilians). The host taps **Continue**.
3. **Day discussion (untimed).** Everyone talks. When ready, the host taps **Start voting**.
4. **Day vote (up to 60 seconds).** See *Shared: voting*. The evicted player's role is revealed (default on, configurable).
5. Check the win conditions, then loop back to Night.

**Win conditions** (checked after every night and every day vote)
- **Civilians win:** all traitors are evicted.
- **Traitors win:** living traitors ≥ living civilians.

**Away players:** a disconnected player's vote counts as skip. A disconnected traitor is excluded from the unanimous lock after 15 seconds away, so the night isn't blocked.

### 3.3 Pictionary

**Players:** 3–12.

**Settings**
- **Genres** (multi-select, at least one; see §5), e.g. Bollywood Movies, Bollywood Songs, Fruits, Random Words.
- **Difficulty:** Easy / Medium / Hard / Mixed (default Medium).
- **Rounds:** default 2; one round = every player draws once.

**Turn loop** (no timers)
1. **Word choice.** The drawer sees 3 random words from the selected genres and difficulty, each labelled with its genre, and picks one. Nobody else sees the options. The host can **Skip turn** if the drawer is stuck.
2. **Drawing.**
   - The drawer gets a canvas: pen, 2–3 sizes, about 8 colours, eraser, undo, clear.
   - Strokes stream live to all other players' screens.
   - Guessers see the canvas, plus the genre and a hint line of blanks (`_ _ _ _ _   _ _ _`). The drawer can tap **Reveal a letter** (up to 2 per word).
   - Guessers type guesses. Matching is case-insensitive, ignores extra spaces, and accepts a word with one character off as "close" (shown to that guesser only as "So close!").
   - A correct guess is **not** shown to others. Others see only "<Name> guessed it!". After guessing correctly, a player can no longer guess and sees the word.
   - In-person: guessers can also shout answers. The drawer taps a player's name to award them the guess.
3. **Turn end.** This happens when every guesser has guessed, or the drawer or host taps **End turn**. The word is revealed to all, and the turn's scores are shown. The host taps **Next turn**.

**Scoring**
- Guesser: +100 for a correct guess.
- Drawer: +25 for each player who guessed correctly.
- The final leaderboard comes after the last round.

**Away players:** a disconnected drawer's turn is skipped. Away guessers don't count towards "everyone has guessed" and don't score.

---

## 4. Visibility rules (server-enforced)

The server must never send a player data they shouldn't see. Each game produces a **per-player view** of the state. No client receives the full state.

| Data | Who receives it |
| --- | --- |
| Imposter: the secret word | Crewmates and the moderator only (and everyone at the reveal). A custom word is never in the room state |
| Imposter: the genre hint | Imposters only on Easy; crewmates and the moderator always |
| Imposter: who the imposters are | The imposters (each other) only, until revealed. Not the moderator |
| Traitor: each player's role | That player only; traitors also get the other traitors' names |
| Traitor: night picks and locks | Living traitors only |
| Votes in progress: count per name | Everyone, live |
| Votes in progress: who voted for whom | Nobody until the result screen |
| Pictionary: word options | Drawer only |
| Pictionary: chosen word | Drawer, plus each guesser after they guess correctly |
| Pictionary: correct guess text | Server only; others see "<Name> guessed it!" |

Client-side hiding is never acceptable. If it's in the network payload, it counts as visible.

---

## 5. Content

- Word lists are organised by **genre**. Each genre is a JSON file: `{ id, name, easy: [...], medium: [...], hard: [...] }`.
- Bollywood Movies are Hindi film titles from 1990 onwards; Bollywood Songs are Hindi song titles. Every other genre is in English.
- Both Imposter and Pictionary use the same genres, difficulty setting and genre picker.
- v1 genres: Bollywood Movies, Hollywood Movies, Bollywood Songs, Fruits & Vegetables, Animals, Food, Places, Objects, Office, Random Words.
- Each genre ships with 100+ words and at least 30 words per difficulty level. "Mixed" draws from all levels.
- All words are family-friendly by default.
- Word lists stay on the server; they are never sent to clients.

---

## 6. Non-functional requirements

- **Mobile-first:** usable at 360px width, large tap targets (44px+), no horizontal scroll.
- **Light / dark theme:** a toggle on every screen. On a first visit it follows the device's system setting; once a player picks, their choice is remembered on that device.
- **Latency:** game actions reflect on other screens in under 300ms on a normal connection. Pictionary strokes should feel live (batch points every ~50ms).
- **Robustness:** the server validates every action: is it this player's turn, is the phase correct, is the target valid. Invalid actions are rejected with an error and never crash the room.
- **Timers are server-side.** Clients only display the countdown from a server-provided deadline.
- **No database in v1.** Rooms live in memory. A server restart ends active games, which is acceptable for v1.
- **Privacy:** store no personal data beyond the display name for the room's lifetime. No analytics in v1.

---

## 7. Decisions log

| Date | Decision |
| --- | --- |
| 2026-10-18 | In-person first; chat is an optional toggle. The imposter sees the genre. Roles are revealed on eviction by vote. No custom word lists in v1. |
| 2026-10-18 | 2 imposters: an evicted imposter who fails the guess is out and the game continues. |
| 2026-10-18 | Lost session token: the host reassigns the seat. No reclaiming by name. |
| 2026-10-18 | Joining mid-game: the player waits and joins the next game. |
| 2026-10-18 | **No discussion or turn timers.** The host taps Start vote, then a 60s vote timer runs. The Imposter clue phase is untimed. |
| 2026-10-18 | Evicted players can't vote or act for the rest of that game. |
| 2026-10-18 | The host can End game at any time, which goes to the results screen. |
| 2026-10-18 | Traitor night ends as soon as all traitors lock the same target (60s safety cap, then no kill). |
| 2026-10-18 | Pictionary is untimed: the turn ends when everyone has guessed or on End turn. Flat scoring (+100 guesser, +25 drawer per guess), and the drawer reveals hint letters. |
| 2026-10-18 | Genres + difficulty (Easy/Medium/Hard/Mixed) are shared by Imposter and Pictionary. |
| 2026-10-18 | Light/dark theme toggle on every screen; defaults to the system setting. |
| 2026-10-19 | Imposter has **no clue phase or turn tracking**: the group goes round robin out loud, then the host taps Start voting. (Replaces the untimed clue phase and the remote typed-clue mode.) |
| 2026-10-19 | Voting (Imposter and Traitor) shows **live vote counts per name** to everyone. Who voted for whom is shown only on the result screen. The vote closes when everyone has voted, or at 60s. |
| 2026-10-19 | The result announces "Imposter caught!" or "<Name> was innocent". A caught imposter keeps the 30s last-chance guess. |
| 2026-10-24 | Lobby setup is two steps for the host: invite + pick a game + players, then Next → settings + Start. |
| 2026-10-24 | Imposter genres are Fruits & Vegetables, Animals, Everyday Objects, Places, Food & Drinks, Office and Random Words (movie and song titles are left out). |
| 2026-10-24 | Imposter **custom word**: the host types the word and moderates (no role, no vote, not counted as a player; doesn't see the roles). The imposter gets no hint. Single-use; cleared after the game or on host change. (Replaces "No custom word lists in v1" for Imposter.) |
| 2026-10-24 | The imposter sees the genre as a hint **only on Easy**. On Medium, Hard, Mixed or a custom word, no hint. |
| 2026-10-24 | **Admin dashboard** at `/admin` (not linked anywhere), with a username/password login set in the server environment. It shows open, active, playing and stale rooms with member names; can close a room or all stale rooms; shows server health and usage stats since the last restart; toggles **maintenance mode** (no new rooms; running games and joins continue); and sends an **announcement** banner to every connected phone. It never shows words or roles. |

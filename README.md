# You Are Under Attack

Live security decision drill. The leader runs it on a big screen, players join on their
phones with no accounts, vote A to D within 60 seconds, and see their score and rank.

- `/` is the player page (phones). `/host` is the leader screen.
- Everything is hosted on Netlify: static pages plus one Netlify Function (`/api/*`) that
  keeps the game state in Netlify Blobs.
- Correct answers and explanations stay on the server until the leader reveals them.

## Deploy (about 5 minutes)

You need a Netlify account and Node.js installed.

1. Put this folder on your computer and open a terminal inside it.
2. `npm install`
3. `npm install -g netlify-cli` then `netlify login`
4. `netlify init` (create a new site) then `netlify deploy --prod`
   (or push the folder to GitHub and import the repo in Netlify, no CLI needed).
5. In Netlify open Site configuration, Environment variables, add `HOST_PIN` with a number
   you choose (for example 4821), then redeploy (`netlify deploy --prod` again).
   Without HOST_PIN nobody can control the drill. This is on purpose.

Note: drag and drop of a folder in the Netlify UI does not install the `@netlify/blobs`
dependency, so use the CLI or GitHub.

## Run the drill

1. Open `https://YOUR-SITE.netlify.app/host`, enter the PIN, pick the number of incidents,
   press Open lobby. The QR code and link on the screen are what players use.
2. Players scan or open the link, enter a name, and wait.
3. Press Start drill. For each incident: Start 60s timer, wait, Reveal answer, discuss, Next.
4. After the last incident press Final results for the podium.
   Reload the leader page any time: it resumes where it was.

Shortcuts on the leader page: Space = timer or next, R = reveal, arrows = navigate.

## Try it on your computer first

    node dev-server.mjs
    # players: http://localhost:8888   leader: http://localhost:8888/host   PIN: 1234

Data lives in memory in this mode and resets when you stop it. `node test.mjs` runs the API tests.

## Limits worth knowing

- Phones refresh every 2 seconds, so a screen can lag the leader by up to about 2 seconds.
  The countdown itself is computed from the server clock, so it stays in step.
- Up to 300 players. For a big room, expect roughly 30 function calls per second at peak.
  Netlify's free plan includes 125,000 function calls a month, enough for one session
  of about 50 players. Check your plan for larger groups.
- Edit the incidents in `netlify/functions/lib/scenarios.mjs` (text, options, answer index
  `a`, explanation, risks) and the drawings in `public/art.js`.

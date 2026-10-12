# Workbench

The study app with an editor, a terminal and a file tree beside the plan, served by a small Python server (`server.py`). Everything except Vivado/Vitis and ServoStudio can happen here: write code, run Python, Icarus/Verilator and cocotb, run tests, commit and push.

What it adds to the plain study app:

- **Files** tab next to **Plan**: browse the repo and open files in a code editor (Monaco, the editor inside VS Code). <kbd>Ctrl</kbd>+<kbd>S</kbd> saves.
- **Terminal** under the editor: a real shell in the repo folder.
- **Paths in the plan are links.** Click `docs/toolchain.md` in a session to open it, or create it if it doesn't exist yet. A green dot means the file is already in the repo. Deliverable checklists show "in repo" once every file they name exists.
- **Shell blocks** in the plan get a **To terminal** button. It pastes the commands into the terminal; press Enter to run them.
- **Progress is saved in the repo** at `.study/progress.json`, so it follows you between machines through git. Commit it like any other file.
- The top bar shows the git branch and how many files have changed.

## Where it runs, and why that matters

The workbench runs commands on the machine that hosts it.

- **On the Unraid server** it is reachable from anywhere and runs the editor, git, Python, simulation and tests. It can reach the PYNQ-Z2 over the network (SSH, Jupyter, Python sockets) and network instruments.
- **USB devices stay with the machine they're plugged into.** The BusLinkers, USB-UART adapter, cameras and any USB instrument are on your laptop, so the sessions that drive them (W2, W3, W11 and so on) need the workbench running on the laptop. It's the same app; see "On the laptop" below.

## On the Unraid server

1. **Get the repo onto the array.** In the Unraid terminal:

   ```bash
   mkdir -p /mnt/user/projects /mnt/user/appdata/arm-workbench
   git clone https://github.com/Embedded-Tinkerer/SO-ARM101.git -b master /mnt/user/projects/arm-on-zynq
   chown -R 99:100 /mnt/user/projects/arm-on-zynq /mnt/user/appdata/arm-workbench
   ```

2. **Set a password.** Create `app/workbench/.env` (it's git-ignored):

   ```bash
   cd /mnt/user/projects/arm-on-zynq/app/workbench
   printf 'WORKBENCH_PASSWORD=%s\nWORKBENCH_SECRET=%s\n' 'choose-a-long-password' "$(head -c 32 /dev/urandom | base64)" > .env
   chown 99:100 .env && chmod 600 .env
   ```

3. **Build and start it.** With the Docker Compose Manager plugin, or from the terminal:

   ```bash
   docker compose -f /mnt/user/projects/arm-on-zynq/app/workbench/docker-compose.yml up -d --build
   ```

   Without Compose:

   ```bash
   cd /mnt/user/projects/arm-on-zynq/app/workbench
   docker build -t arm-workbench .
   docker run -d --name arm-workbench --restart unless-stopped --user 99:100 --env-file .env \
     -v /mnt/user/projects/arm-on-zynq:/workspace -v /mnt/user/appdata/arm-workbench:/config \
     -p 8095:8080 arm-workbench
   ```

   Open `http://UNRAID_IP:8095` on your LAN to check it works before adding the domain.

4. **Let git push from the workbench.** In the workbench terminal:

   ```bash
   git config --global user.name "brian"
   git config --global user.email "you@example.com"
   ssh-keygen -t ed25519 -C arm-workbench      # press Enter through the prompts
   cat ~/.ssh/id_ed25519.pub                   # add this at github.com/settings/keys
   git remote set-url origin git@github.com:Embedded-Tinkerer/SO-ARM101.git
   ```

   The key lives in `/mnt/user/appdata/arm-workbench/.ssh`, so it survives rebuilds. Add the same public key to the PYNQ's `~/.ssh/authorized_keys` to SSH to the board from the workbench.

**Updating:** `git pull` in the workbench terminal updates the plan and the app. Restart the container (`docker restart arm-workbench`) after pulling changes to `app/workbench/server.py`. Rebuild (`up -d --build`) only when the `Dockerfile` changes.

## Pointing your domain at it

`nginx.conf` is a complete site file: replace `arm.example.com`, the certificate paths and `UNRAID_IP`. The `Upgrade` and `Connection` headers are what make the terminal work through the proxy. On nginx older than 1.25, change `listen 443 ssl;` + `http2 on;` to `listen 443 ssl http2;`.

With **Nginx Proxy Manager** or **SWAG** instead: forward the domain to `UNRAID_IP:8095`, turn on **Websockets Support**, and request a Let's Encrypt certificate with **Force SSL**.

**Keep it private.** The workbench has a terminal, so anyone who logs in can run commands on the server with access to the repo and appdata folders. It has a password and slows down wrong guesses, but the safer setup is to not expose it to the internet at all: reach it over Tailscale or WireGuard, or put Cloudflare Access (or Authelia/Authentik) in front of nginx so only your account gets through to the login page.

## On the laptop

For the hardware sessions, run the same app next to the arms:

```bash
cd ~/arm-on-zynq
pip install aiohttp            # inside your project venv
python app/workbench/vendor.py # once: downloads the editor and terminal libraries
python app/workbench/server.py --no-auth
```

Open <http://127.0.0.1:8080>. `--no-auth` only works on 127.0.0.1, so nothing else on the network can reach it. The terminal runs as you, with your venv, serial ports and instruments. Progress is the same `.study/progress.json`, so commit and pull to move between laptop and server.

## Files

- `server.py`: the server (aiohttp). Serves the study page built from `captone.md`, the file API, the terminal websocket and the login.
- `static/workbench.js`, `static/workbench.css`: the editor, terminal and file panes, and the plan-to-repo links.
- `vendor.py`: downloads Monaco 0.52.2 and xterm.js 5.5.0 into `vendor/` (git-ignored).
- `Dockerfile`, `docker-compose.yml`, `nginx.conf`: the Unraid deployment.

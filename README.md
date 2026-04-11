# Dungeon Game

Joc 3D multiplayer în browser — Phase I.

## Project Structure

```
dungeon/
├── .github/
│   └── workflows/
│       └── ci.yml        ← GitHub Actions: lint + docker smoke test
├── src/
│   ├── css/              ← styles
│   ├── js/               ← game logic
│   └── game.html         ← entry point
├── Dockerfile            ← containerization with nginx:alpine
├── .dockerignore
└── README.md

```

## How to Run Locally with Docker

```Bash
# Build the image
docker build -t dungeon-game .

# Start the container
docker run -p 8080:80 dungeon-game

# Open in browser
http://localhost:8080/game.html
```

## CI/CD
On every push or Pull Request to master, GitHub Actions performs:
1. **validate** — HTML linting + structure verification (running in Alpine)
2. **docker-build** — builds the image and performs an HTTP smoke test

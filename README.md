# Dungeon Game

Joc 3D multiplayer în browser — Phase I.

## Structura proiectului

```
dungeon/
├── .github/
│   └── workflows/
│       └── ci.yml        ← GitHub Actions: lint + docker smoke test
├── src/
│   ├── css/              ← stiluri
│   ├── js/               ← logica jocului
│   └── game.html         ← entry point
├── Dockerfile            ← containerizare cu nginx:alpine
├── .dockerignore
└── README.md
```

## Cum rulezi local cu Docker

```bash
# Construiesti imaginea
docker build -t dungeon-game .

# Pornesti containerul
docker run -p 8080:80 dungeon-game

# Deschizi in browser
http://localhost:8080/game.html
```

## CI/CD

La fiecare push sau Pull Request spre `master`, GitHub Actions:
1. **validate** — lint HTML + verifica structura (rulat in Alpine)
2. **docker-build** — construieste imaginea si face smoke test HTTP

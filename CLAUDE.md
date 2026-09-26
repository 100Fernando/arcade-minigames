# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a simple Python/Pygame project containing a Space Invaders-style arcade game. The project consists of:

- **`main.py`** - Main entry point that initializes and runs the Pygame application
- **`space_invaders.py`** - Core game logic with classes for `Player`, `Enemy`, `Bullet`, and `Game`
- **`index.html`** - A standalone web page with a target-clicking mini-game and particles background

## How to Run

```bash
# Run the Space Invaders game
python main.py

# Run the web page in a browser
python -m http.server 8000
# Then open http://localhost:8000 in a browser
```

## Game Controls

- **← / → (Left/Right Arrow)** - Move player
- **Space** - Fire bullet
- **R** - Restart after Game Over

## Code Architecture

### `space_invaders.py`

The game logic is organized into four main classes:

**Player** - The player's spaceship
- `width: 50`, `height: 30`
- Drawn as a green triangle
- `move(direction)`, `get_rect()`, `draw()`

**Enemy** - Alien invaders
- `width: 40`, `height: 30`
- Drawn as red rectangles with white eyes
- Move horizontally and bounce at edges
- `reverse_direction()` flips movement and drops down

**Bullet** - Projectiles fired by player and enemies
- Player bullets move upward, enemy bullets move downward
- `move()`, `get_rect()`, `draw()`

**Game** - Main game controller
- Manages player, enemies, bullets, enemy bullets, score, lives
- `handle_events()` - Processes quit, keydown events
- `update()` - Moves entities, handles collisions, respawns enemies
- `draw()` - Renders all game elements

### `main.py`

Minimal entry point:
```python
def main():
    clock = pygame.time.Clock()
    game = Game()
    while running:
        running = game.handle_events()
        game.update()
        game.draw()
        clock.tick(60)  # 60 FPS
```

### `index.html`

A self-contained HTML/JS page with:
- CSS-only animated particles background (30 particles + 50 stars)
- Target game with emoji icons (🎯 ⭐ 💎 🔥 ⚡ 🌟)
- Collapsible card and game sections
- Space Invaders canvas game with full game engine (Player, Enemy, Bullet, Particle classes)

## Dependencies

```
pygame
```

## Key Files

| File | Purpose |
|------|---------|
| `space_invaders.py` | Core game logic |
| `main.py` | Entry point |
| `index.html` | Standalone web page |

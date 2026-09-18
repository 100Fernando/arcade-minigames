import pygame
import random
import sys

# Inicialização do Pygame
pygame.init()

# Configurações da tela
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("Space Invaders")

# Cores
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GREEN = (0, 255, 0)
RED = (255, 0, 0)
BLUE = (0, 120, 255)

# Classe do jogador
class Player:
    def __init__(self):
        self.width = 50
        self.height = 30
        self.x = SCREEN_WIDTH // 2 - self.width // 2
        self.y = SCREEN_HEIGHT - 60
        self.speed = 5
        self.color = GREEN
        
    def draw(self):
        # Desenha uma nave triangular
        points = [
            (self.x + self.width // 2, self.y),
            (self.x, self.y + self.height),
            (self.x + self.width, self.y + self.height)
        ]
        pygame.draw.polygon(screen, self.color, points)
        
    def move(self, direction):
        if direction == "left" and self.x > 0:
            self.x -= self.speed
        if direction == "right" and self.x < SCREEN_WIDTH - self.width:
            self.x += self.speed
            
    def get_rect(self):
        return pygame.Rect(self.x, self.y, self.width, self.height)

# Classe dos inimigos
class Enemy:
    def __init__(self, x, y):
        self.width = 40
        self.height = 30
        self.x = x
        self.y = y
        self.speed = 1
        self.color = RED
        
    def draw(self):
        # Desenha um inimigo retangular
        pygame.draw.rect(screen, self.color, (self.x, self.y, self.width, self.height))
        # Desenha olhos
        pygame.draw.circle(screen, WHITE, (self.x + 10, self.y + 10), 5)
        pygame.draw.circle(screen, WHITE, (self.x + 30, self.y + 10), 5)
        
    def move(self):
        self.x += self.speed
        
    def reverse_direction(self):
        self.y += 20
        self.speed *= -1
        
    def get_rect(self):
        return pygame.Rect(self.x, self.y, self.width, self.height)

# Classe do projétil
class Bullet:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        self.speed = 7
        self.width = 5
        self.height = 15
        self.color = WHITE
        
    def draw(self):
        pygame.draw.rect(screen, self.color, (self.x, self.y, self.width, self.height))
        
    def move(self):
        self.y -= self.speed
        
    def get_rect(self):
        return pygame.Rect(self.x, self.y, self.width, self.height)

# Classe do jogo
class Game:
    def __init__(self):
        self.player = Player()
        self.enemies = []
        self.bullets = []
        self.enemy_bullets = []
        self.score = 0
        self.lives = 3
        self.enemy_direction = 1
        self.enemy_move_down = False
        self.game_over = False
        self.font = pygame.font.Font(None, 36)
        
        # Cria os inimigos em uma grade
        for row in range(5):
            for col in range(10):
                enemy = Enemy(col * 70 + 50, row * 50 + 50)
                self.enemies.append(enemy)
                
    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE and not self.game_over:
                    # Atirar
                    bullet = Bullet(self.player.x + self.player.width // 2 - 2, self.player.y)
                    self.bullets.append(bullet)
                elif event.key == pygame.K_r and self.game_over:
                    # Reiniciar o jogo
                    self.__init__()
        return True
        
    def update(self):
        if self.game_over:
            return
            
        # Movimentação do jogador
        keys = pygame.key.get_pressed()
        if keys[pygame.K_LEFT]:
            self.player.move("left")
        if keys[pygame.K_RIGHT]:
            self.player.move("right")
            
        # Movimentação dos projéteis
        for bullet in self.bullets[:]:
            bullet.move()
            if bullet.y < 0:
                self.bullets.remove(bullet)
                
        # Movimentação dos projéteis dos inimigos
        for bullet in self.enemy_bullets[:]:
            bullet.move()
            if bullet.y > SCREEN_HEIGHT:
                self.enemy_bullets.remove(bullet)
                
        # Movimentação dos inimigos
        move_down = False
        for enemy in self.enemies:
            enemy.move()
            if enemy.x <= 0 or enemy.x >= SCREEN_WIDTH - enemy.width:
                move_down = True
                
        if move_down:
            for enemy in self.enemies:
                enemy.reverse_direction()
                
        # Verificar colisões entre projéteis do jogador e inimigos
        for bullet in self.bullets[:]:
            for enemy in self.enemies[:]:
                if bullet.get_rect().colliderect(enemy.get_rect()):
                    self.bullets.remove(bullet)
                    self.enemies.remove(enemy)
                    self.score += 10
                    break
                    
        # Verificar colisões entre projéteis dos inimigos e jogador
        for bullet in self.enemy_bullets[:]:
            if bullet.get_rect().colliderect(self.player.get_rect()):
                self.enemy_bullets.remove(bullet)
                self.lives -= 1
                if self.lives <= 0:
                    self.game_over = True
                break
                
        # Inimigos atirando aleatoriamente
        if random.random() < 0.02 and self.enemies:
            shooter = random.choice(self.enemies)
            bullet = Bullet(shooter.x + shooter.width // 2 - 2, shooter.y + shooter.height)
            self.enemy_bullets.append(bullet)
            
        # Verificar se todos os inimigos foram destruídos
        if len(self.enemies) == 0:
            # Criar novos inimigos
            for row in range(5):
                for col in range(10):
                    enemy = Enemy(col * 70 + 50, row * 50 + 50)
                    self.enemies.append(enemy)
                    
    def draw(self):
        screen.fill(BLACK)
        
        # Desenhar jogador
        self.player.draw()
        
        # Desenhar inimigos
        for enemy in self.enemies:
            enemy.draw()
            
        # Desenhar projéteis do jogador
        for bullet in self.bullets:
            bullet.draw()
            
        # Desenhar projéteis dos inimigos
        for bullet in self.enemy_bullets:
            bullet.draw()
            
        # Desenhar informações do jogo
        score_text = self.font.render(f"Pontuação: {self.score}", True, WHITE)
        lives_text = self.font.render(f"Vidas: {self.lives}", True, WHITE)
        screen.blit(score_text, (10, 10))
        screen.blit(lives_text, (SCREEN_WIDTH - 120, 10))
        
        # Desenhar game over
        if self.game_over:
            game_over_text = self.font.render("GAME OVER! Pressione R para reiniciar", True, WHITE)
            text_rect = game_over_text.get_rect(center=(SCREEN_WIDTH//2, SCREEN_HEIGHT//2))
            screen.blit(game_over_text, text_rect)
            
        pygame.display.flip()

# Função principal
def main():
    clock = pygame.time.Clock()
    game = Game()
    
    running = True
    while running:
        running = game.handle_events()
        game.update()
        game.draw()
        clock.tick(60)
        
    pygame.quit()
    sys.exit()

if __name__ == "__main__":
    main()

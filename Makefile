# --- Configuration du Compilateur ---
CC = x86_64-w64-mingw32-gcc
CFLAGS = -Wall -O2 -Iinclude -DSDL_MAIN_HANDLED
LDFLAGS = -Llib -lmingw32 -lSDL2main -lSDL2 -lavformat -lavdevice -lavcodec -lavutil -lswscale -mwindows

# --- Chemins ---
SRC = $(wildcard src/*.c)
OBJ = $(SRC:.c=.o)
TARGET = bin/CamLinkPlayer.exe

# --- Règles ---

all: $(TARGET)

$(TARGET): $(OBJ)
	@mkdir -p bin
	$(CC) $(OBJ) -o $(TARGET) $(LDFLAGS)
	@echo "------------------------------------------"
	@echo "Compilation terminée : $(TARGET)"
	@echo "N'oubliez pas de copier les DLLs dans bin/"
	@echo "------------------------------------------"

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

clean:
	rm -f src/*.o $(TARGET)

# Règle pour lancer avec Wine (optionnel, pour tester sous Linux)
run:
	wine $(TARGET)
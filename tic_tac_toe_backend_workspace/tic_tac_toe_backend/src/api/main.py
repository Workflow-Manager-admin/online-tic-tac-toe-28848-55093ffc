from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Literal
import uuid


app = FastAPI(
    title="Tic Tac Toe API",
    description="REST API for Tic Tac Toe game sessions, moves, and state reporting.",
    version="1.0.0",
    openapi_tags=[
        {
            "name": "games",
            "description": "Endpoints related to managing game sessions."
        },
        {
            "name": "moves",
            "description": "Endpoints for making and querying moves within a game."
        },
        {
            "name": "state",
            "description": "Endpoints for retrieving current game state."
        }
    ]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateGameResponse(BaseModel):
    game_id: str = Field(
        ..., description="The unique ID for the new game session."
    )
    player_id: str = Field(
        ..., description="The unique ID for the creating player (Player X)."
    )
    symbol: Literal["X", "O"] = Field(
        ..., description="The symbol assigned to this player."
    )


class JoinGameRequest(BaseModel):
    pass


class JoinGameResponse(BaseModel):
    game_id: str = Field(
        ..., description="The unique ID of the joined game session."
    )
    player_id: str = Field(
        ..., description="The unique ID for the joining player (Player O)."
    )
    symbol: Literal["X", "O"] = Field(
        ..., description="The symbol assigned to this player."
    )


class MoveRequest(BaseModel):
    player_id: str = Field(
        ..., description="ID of the player making this move."
    )
    row: int = Field(
        ..., description="0-based row index (0-2)."
    )
    col: int = Field(
        ..., description="0-based column index (0-2)."
    )


class MoveResponse(BaseModel):
    success: bool
    message: str
    board: List[List[Optional[str]]]
    next_turn: Optional[str] = Field(
        None, description="Symbol (X/O) of player to move next, or None if game is over."
    )
    status: str = Field(
        ..., description="'in_progress', 'draw', or 'won'"
    )
    winner: Optional[str] = Field(
        None, description="Symbol of the winner if any, else None."
    )


class GameStateResponse(BaseModel):
    board: List[List[Optional[str]]]
    your_symbol: Optional[str] = Field(
        None, description="Symbol (X/O) for the requesting player, if known."
    )
    next_turn: Optional[str] = Field(
        None, description="Symbol (X/O) to move next, or None if game over."
    )
    status: str = Field(
        ..., description="'in_progress', 'draw', or 'won'"
    )
    winner: Optional[str] = Field(
        None, description="Symbol of the winner if any, else None."
    )
    message: Optional[str] = Field(
        None, description="Human-readable explanation of game state."
    )


games: Dict[str, dict] = {}


def check_winner(
    board: List[List[Optional[str]]]
) -> Optional[str]:
    # Check rows, columns and diagonals for winner ("X" or "O")
    lines = board + [list(col) for col in zip(*board)]
    lines.append([board[i][i] for i in range(3)])
    lines.append([board[i][2 - i] for i in range(3)])
    for line in lines:
        if line[0] and all(cell == line[0] for cell in line):
            return line[0]
    return None


def is_draw(
    board: List[List[Optional[str]]]
) -> bool:
    return all(cell for row in board for cell in row) and not check_winner(board)


def make_empty_board():
    return [[None for _ in range(3)] for _ in range(3)]


# PUBLIC_INTERFACE
@app.get("/", tags=["state"])
def health_check():
    """Root health check."""
    return {"message": "Healthy"}


# PUBLIC_INTERFACE
@app.post(
    "/games",
    response_model=CreateGameResponse,
    tags=["games"],
    summary="Create new game",
    description=(
        "Start a new Tic Tac Toe game session. "
        "Returns a unique game_id and the player's token (for Player X)."
    )
)
def create_game():
    """Create a new game session and assign the creator as Player X."""
    game_id = str(uuid.uuid4())
    player_id = str(uuid.uuid4())
    games[game_id] = {
        "board": make_empty_board(),
        "players": {
            "X": player_id,
            "O": None
        },
        "turn": "X",
        "status": "in_progress",
        "winner": None
    }
    return CreateGameResponse(
        game_id=game_id,
        player_id=player_id,
        symbol="X"
    )


# PUBLIC_INTERFACE
@app.post(
    "/games/{game_id}/join",
    response_model=JoinGameResponse,
    tags=["games"],
    summary="Join existing game",
    description=(
        "Join an existing game as Player O, if there is an open slot. "
        "Returns identifiers and symbol assignment."
    )
)
def join_game(game_id: str, _: JoinGameRequest = None):
    """Join a game as Player O."""
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game ID not found.")
    if game["players"]["O"]:
        raise HTTPException(status_code=400, detail="Game already has two players.")
    player_id = str(uuid.uuid4())
    game["players"]["O"] = player_id
    return JoinGameResponse(
        game_id=game_id,
        player_id=player_id,
        symbol="O"
    )


# PUBLIC_INTERFACE
@app.post(
    "/games/{game_id}/move",
    response_model=MoveResponse,
    tags=["moves"],
    summary="Submit a move",
    description=(
        "Submit a move for the given game_id and player. "
        "Expects player authentication and move coordinates."
    )
)
def submit_move(game_id: str, move: MoveRequest):
    """Submit a move to the board, validate turn and update game state."""
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game ID not found.")

    # Player validation
    player_symbol = None
    for symbol, pid in game["players"].items():
        if pid == move.player_id:
            player_symbol = symbol
            break
    if not player_symbol:
        raise HTTPException(status_code=403, detail="Invalid player for this game.")

    # Game status checks
    if game["status"] != "in_progress":
        return MoveResponse(
            success=False,
            message=f"Game already finished ({game['status']}).",
            board=game["board"],
            next_turn=None,
            status=game["status"],
            winner=game["winner"]
        )

    # Turn check
    if player_symbol != game["turn"]:
        return MoveResponse(
            success=False,
            message=f"It's not your turn. Current turn: {game['turn']}",
            board=game["board"],
            next_turn=game["turn"],
            status=game["status"],
            winner=None
        )

    # Move validity
    if move.row not in range(3) or move.col not in range(3):
        raise HTTPException(
            status_code=422,
            detail="Row/Col must be 0, 1, or 2."
        )
    if game["board"][move.row][move.col] is not None:
        return MoveResponse(
            success=False,
            message="Cell is already occupied.",
            board=game["board"],
            next_turn=game["turn"],
            status=game["status"],
            winner=None
        )

    # Apply move
    game["board"][move.row][move.col] = player_symbol

    # Check for win/draw
    winner = check_winner(game["board"])
    if winner:
        game["status"] = "won"
        game["winner"] = winner
        next_turn = None
        message = f"Player {winner} wins!"
    elif is_draw(game["board"]):
        game["status"] = "draw"
        game["winner"] = None
        next_turn = None
        message = "Game is a draw."
    else:
        # Swap turn
        next_turn = "O" if game["turn"] == "X" else "X"
        game["turn"] = next_turn
        game["winner"] = None
        message = "Move accepted."

    return MoveResponse(
        success=True,
        message=message,
        board=game["board"],
        next_turn=next_turn,
        status=game["status"],
        winner=game["winner"]
    )


# PUBLIC_INTERFACE
@app.get(
    "/games/{game_id}/state",
    response_model=GameStateResponse,
    tags=["state"],
    summary="Get current game state",
    description=(
        "Get game board, whose turn, status (in_progress, won/draw), "
        "and outcome for a given game."
    )
)
def get_game_state(game_id: str, player_id: Optional[str] = None):
    """
    Fetch current board, status, and turn.
    Optionally provides requested player's symbol.
    """
    game = games.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game ID not found.")

    your_symbol = None
    if player_id:
        for symbol, pid in game["players"].items():
            if pid == player_id:
                your_symbol = symbol
                break

    message = "Game in progress."
    if game["status"] == "won":
        message = f"Player {game['winner']} has won."
    elif game["status"] == "draw":
        message = "Game ended in a draw."

    return GameStateResponse(
        board=game["board"],
        your_symbol=your_symbol,
        next_turn=game["turn"] if game["status"] == "in_progress" else None,
        status=game["status"],
        winner=game["winner"],
        message=message
    )

import pandas as pd

def has_sot_column(df: pd.DataFrame) -> bool:
    """True se o DataFrame tem alguma coluna de Shots on Target (SoT).
    Trata colunas simples e MultiIndex."""
    for col in df.columns:
        parts = col if isinstance(col, tuple) else (col,)
        if any(str(p).strip().lower() == "sot" for p in parts):
            return True
    return False

def fetch_fbref_shooting_sample(league: str = "ENG-Premier League", season: str = "2425") -> "pd.DataFrame":
    """Puxa stats de chute por jogador via soccerdata/FBref para checar se SoT existe.
    Importa soccerdata dentro da função pra não pesar nos testes unitários."""
    import soccerdata as sd
    fbref = sd.FBref(leagues=league, seasons=season)
    return fbref.read_player_season_stats(stat_type="shooting")

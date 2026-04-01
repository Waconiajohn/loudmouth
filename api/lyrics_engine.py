import sys
import json
import requests

GENIUS_TOKEN = "-EMs_LXrCwIFmorr08ojl7nxUFAh9h9dMCa36HsC3BnGDSJk3COtxr3j8RYnmp2d"

def search_song(artist, title):
    headers = {"Authorization": f"Bearer {GENIUS_TOKEN}"}
    params = {"q": f"{artist} {title}"}
    r = requests.get("https://api.genius.com/search", headers=headers, params=params)
    hits = r.json()["response"]["hits"]
    if not hits:
        return None
    return hits[0]["result"]

def get_song_info(artist, title):
    song = search_song(artist, title)
    if not song:
        return None
    return {
        "title": song["title"],
        "artist": song["primary_artist"]["name"],
        "genius_url": song["url"],
        "thumbnail": song["header_image_thumbnail_url"],
        "song_id": song["id"]
    }

if __name__ == "__main__":
    artist = sys.argv[1] if len(sys.argv) > 1 else "Disturbed"
    title  = sys.argv[2] if len(sys.argv) > 2 else "Down With The Sickness"
    result = get_song_info(artist, title)
    print(json.dumps(result, indent=2))

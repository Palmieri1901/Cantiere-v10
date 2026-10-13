"""Una tantum: iniziali maiuscole su nomi/cognomi già presenti in archivio."""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
from motor.motor_asyncio import AsyncIOMotorClient
from helpers import capitalizza_nome


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    tot = {}
    for coll, campi in (("clienti", ("nome", "cognome")), ("clienti_esterni", ("nome",)), ("dipendenti", ("nome",))):
        n = 0
        async for d in db[coll].find({}, {c: 1 for c in campi}):
            upd = {c: capitalizza_nome(d.get(c)) for c in campi if capitalizza_nome(d.get(c)) != d.get(c)}
            if upd:
                await db[coll].update_one({"_id": d["_id"]}, {"$set": upd})
                n += 1
        tot[coll] = n
    print("aggiornati:", tot)


if __name__ == "__main__":
    asyncio.run(main())

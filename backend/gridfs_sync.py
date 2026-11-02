"""GridFS bucket che registra upload/cancellazioni nel registro di sincronizzazione (sync_log).

Motor esegue GridFS tramite pymongo sincrono, quindi i wrapper di sync_log non intercettano i file:
tutti i router devono usare SyncBucket invece di AsyncIOMotorGridFSBucket.
"""
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from sync_log import _log, now_ts


class SyncBucket:
    def __init__(self, db, bucket_name: str):
        self._b = AsyncIOMotorGridFSBucket(db, bucket_name=bucket_name)
        self._files = db[f"{bucket_name}.files"]

    async def _mark(self, oid: ObjectId):
        ts = now_ts()
        await self._files.update_one({"_id": oid}, {"$set": {"_sync_ts": ts}})
        await _log(self._files, [str(oid)], "upsert", ts)

    async def upload_from_stream(self, filename, source, metadata=None) -> ObjectId:
        oid = await self._b.upload_from_stream(filename, source, metadata=metadata)
        await self._mark(oid)
        return oid

    async def upload_from_stream_with_id(self, oid: ObjectId, filename, source, metadata=None):
        await self._b.upload_from_stream_with_id(oid, filename, source, metadata=metadata)
        await self._mark(oid)

    async def open_download_stream(self, oid: ObjectId):
        return await self._b.open_download_stream(oid)

    async def delete(self, oid: ObjectId):
        await self._b.delete(oid)
        await _log(self._files, [str(oid)], "delete", now_ts())

    def find(self, *a, **k):
        return self._b.find(*a, **k)

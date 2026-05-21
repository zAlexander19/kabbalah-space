"""Create a promo code from the command line.

Usage:
    python scripts/create_promo_code.py --code LAUNCH7 --trial-days 7 --max-uses 100 --expires 2026-12-31
    python scripts/create_promo_code.py --code FRIENDS --trial-days 7
    python scripts/create_promo_code.py --code UNLIMITED --trial-days 14 --max-uses 0
        (max-uses=0 means unlimited; argparse stores as None internally)
"""
import argparse
import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

# Allow running from the backend/ directory
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.ext.asyncio import async_sessionmaker

from database import engine
from billing.models import PromoCode


async def main():
    parser = argparse.ArgumentParser(description="Create a promo code")
    parser.add_argument("--code", required=True, help="The promo code string (uppercased automatically)")
    parser.add_argument("--trial-days", type=int, default=7, help="Trial days granted by this code (default 7)")
    parser.add_argument(
        "--max-uses", type=int, default=None,
        help="Max uses. 0 or unset = unlimited.",
    )
    parser.add_argument(
        "--expires", default=None,
        help="Expiration date YYYY-MM-DD. Unset = no expiry.",
    )
    args = parser.parse_args()

    expires_at = None
    if args.expires:
        expires_at = datetime.strptime(args.expires, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    max_uses = args.max_uses if args.max_uses and args.max_uses > 0 else None

    session_maker = async_sessionmaker(engine, expire_on_commit=False)
    async with session_maker() as session:
        promo = PromoCode(
            code=args.code.upper(),
            trial_days=args.trial_days,
            max_uses=max_uses,
            expires_at=expires_at,
        )
        session.add(promo)
        await session.commit()
        print(f"Created promo code: {promo.code} (id={promo.id}, trial_days={promo.trial_days}, "
              f"max_uses={promo.max_uses}, expires_at={promo.expires_at})")


if __name__ == "__main__":
    asyncio.run(main())

-- Migration: 003_listing_parcel_geometry.sql
-- Purpose: Add parcel geometry fields to listings for map-based visualization
-- Date: 2026-03-11

ALTER TABLE listings ADD COLUMN parcel_pnu TEXT;
ALTER TABLE listings ADD COLUMN center_lat REAL;
ALTER TABLE listings ADD COLUMN center_lng REAL;
ALTER TABLE listings ADD COLUMN parcel_geojson TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_parcel_pnu ON listings(parcel_pnu);

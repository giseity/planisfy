# Local Elevation Data

Run `scripts/elevation-dev.sh download-portland` from the repository root to
hydrate this directory with the SRTM HGT tile used by the local elevation
service. The `.hgt` files are ignored by git and mounted into the elevation
container at `/data/elevation`.

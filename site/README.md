# Project BAKEBAKE website

The public site is https://bakebake.org/.

GitHub Pages publishes the **root of `main` in [Suke-go/bakebake](https://github.com/Suke-go/bakebake)**.
Pushing this `site/` directory to `Suke-go/bakebake-generator` does not update GitHub Pages.

To publish changes, work in a checkout of `Suke-go/bakebake`: update `build.py`, styles, and assets, run `python build.py`, then commit and push the generated pages to that repository's `main` branch. Keep its `CNAME` and `.nojekyll` files. Confirm the Pages deployment succeeds and check the live site.

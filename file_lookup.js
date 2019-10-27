"use strict";

const fs = require("fs");
const path = require("path");

const util = {
  create_hash: require("./utils/hash_util.js"),
  console: require("./utils/console_util.js"),
  fs: require("./utils/fs_util.js"),
  progress: require("./utils/progress_util.js")
};

module.exports = exports = class FileLookup {
  constructor(root, emit_init) {
    this.index = [];

    if (!fs.existsSync(root)) {
      emit_init(this);
      return;
    }

    util.console.log("[b]Creating file lookup[/b]", util.console.constants.LEADING_SPACE);

    this.folder_stats = util.fs.get_folder_stats(root);
    this.progress = new util.progress(this.folder_stats, "Indexed __PROGRESS__% (__CURRENTCOUNT__/__TOTALCOUNT__)");

    util.console.log(`Found [u]${this.folder_stats.files} files[/u] in [u]${this.folder_stats.dirs} directories[/u].`);

    this.index_files(root, emit_init);
  }

  index_files(root, emit_init) {
    fs.readdir(root, { withFileTypes: true }, (err, files) => {
      if (err) {
        throw err;
      }

      files.forEach(dirent => {
        if (dirent.name[0] == ".") {
          return;
        }

        if (dirent.isDirectory()) {
          this.index_files(path.join(root, dirent.name), emit_init);
          return;
        }

        util.create_hash.async(path.join(root, dirent.name), hash => {
          this.add_hash(hash);
          this.progress.step();

          if (this.index.length === this.folder_stats.files) {
            emit_init(this);
          }
        });
      });
    });
  }

  add_hash(hash) {
    if (!this.index.includes(hash)) {
      this.index.push(hash);
    }
  }

  contains(hash) {
    return this.index.includes(hash);
  }
}
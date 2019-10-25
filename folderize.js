"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { create_file_hash, create_file_hash_sync } = require("./hash_util.js");
const date_util = require("./date_util.js");
const { log, constants: log_constants } = require("./console_util.js");
const fs_util = require("./fs_util.js");

const src = process.argv[2];
const dst = process.argv[3];

class FileLookup {
  constructor(root, emit_init) {
    this.index = [];

    if (!fs.existsSync(root)) {
      emit_init(this);
      return;
    }

    log("[b]Creating file lookup[/b]", log_constants.LEADING_SPACE);

    this.folder_stats = fs_util.get_folder_stats(root);
    this.progress_steps = 10;
    this.progress_step = this.folder_stats.files / this.progress_steps;
    this.current_progress_step = 0;
    this.file_progress = 0;

    log(`Found [u]${this.folder_stats.files} files[/u] in [u]${this.folder_stats.dirs} directories[/u].`);

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

        create_file_hash(path.join(root, dirent.name), hash => {
          this.add_hash(hash);
          this.log_progress();

          if (this.index.length === this.folder_stats.files) {
            emit_init(this);
          }
        });
      });
    });
  }

  log_progress() {
    this.file_progress++;

    const progress = Math.floor(100 / this.folder_stats.files * this.file_progress);

    if (this.file_progress - this.current_progress_step > this.progress_step || progress === 100) {
      log(`Indexed ${progress}% (${this.file_progress}/${this.folder_stats.files})`);
      this.current_progress_step += this.progress_step;
    }
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

class FileCopy {
  constructor(src, dst) {
    log(`← \`${src}'\n→ \`${dst}'.`, log_constants.LEADING_SPACE);

    this.src = src;
    this.dst = dst;
    this.dst_file_lookup;

    new FileLookup(dst, file_lookup => {
      this.dst_file_lookup = file_lookup;

      log("[b]Copying files[/b]", log_constants.LEADING_SPACE);

      this.folder_stats = fs_util.get_folder_stats(src);
      this.progress_steps = 10;
      this.progress_step = this.folder_stats.files / this.progress_steps;
      this.current_progress_step = 0;
      this.file_progress = 0;

      log(`Found [u]${this.folder_stats.files} files[/u] in [u]${this.folder_stats.dirs} directories[/u].`);

      this.copy_folder(src);
    });
  }

  copy_folder(root) {
    fs.readdirSync(root, { withFileTypes: true })
      .filter(dirent => dirent.name[0] !== ".")
      .filter(dirent => !(dirent.isDirectory() && !this.copy_folder(path.join(root, dirent.name))))
      .map(file => {
        const filepath = path.join(root, file.name);
        const filehash = create_file_hash_sync(filepath);

        if (this.dst_file_lookup.contains(filehash)) {
          this.log_progress();
          return;
        }

        const lstat = fs.lstatSync(filepath);
        const ldate = date_util.extract(lstat.mtime);
        const dst_folder = path.join(this.dst, ldate.year, ldate.month, ldate.day);
        let dst_file = path.join(dst_folder, file.name);

        if (!fs.existsSync(dst_folder)) {
          fs.mkdirSync(dst_folder, { recursive: true });
        }

        let rename_tries = 0;
        while(fs.existsSync(dst_file)) {
          const dst_file_parsed = path.parse(dst_file);
          dst_file = path.join(
            dst_file_parsed.dir,
            `${dst_file_parsed.name} (${++rename_tries})${dst_file_parsed.ext}`
          );
        }

        fs.copyFileSync(filepath, dst_file);
        fs.utimesSync(dst_file, lstat.atime, lstat.mtime);

        this.dst_file_lookup.add_hash(filehash);

        this.log_progress();
      });
  }

  log_progress() {
    this.file_progress++;

    const progress = Math.floor(100 / this.folder_stats.files * this.file_progress);

    if (this.file_progress - this.current_progress_step > this.progress_step || progress === 100) {
      log(`Copied ${progress}% (${this.file_progress}/${this.folder_stats.files})`);
      this.current_progress_step += this.progress_step;
    }
  }
}

new FileCopy(src, dst);

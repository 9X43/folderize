"use strict";

const { log, constants: log_constants } = require("./console_util.js");

module.exports = exports = class ProgressUtil {
  constructor(folder_stats, step_msg) {
    this.folder_stats = folder_stats;
    this.step_msg = step_msg;

    this.progress_steps = 20;
    this.progress_step = this.folder_stats.files / this.progress_steps;
    this.current_progress_step = 0;

    this.vars = {
      "__PROGRESS__": 0,
      "__CURRENTCOUNT__": 0,
      "__TOTALCOUNT__": this.folder_stats.files
    };
  }

  _get_key_id(k) {
    if (/^__[A-Z]*__$/.test(k)) {
      return k;
    } else {
      return `__${k}__`;
    }
  }

  _get_var(kvar) {
    const id = this._get_key_id(kvar);

    if (this.vars.hasOwnProperty(id)) {
      return this.vars[id];
    } else {
      throw new Error(`Variable \`${id}' is undefined.`);
    }
  }

  _set_var(kvar, v) {
    const id = this._get_key_id(kvar);

    this.vars[id] = v;

    return this.vars[id];
  }

  _update_var(kvar, v) {
    const id = this._get_key_id(kvar);

    this.vars[id] += v;

    return this.vars[id];
  }

  _replace_vars(msg) {
    return msg
      .replace(/__[A-Z]*__/g, v => this._get_var(v))
      .replace(/__IF:[A-Z]+?=[^:]+?:FI__/g, v => {
        const [_if, statement, _fi] = v.split(":");
        const [condition, cond_msg] = statement.split("=");

        if (this.vars.hasOwnProperty(this._get_key_id(condition))) {
          return this._replace_vars(cond_msg);
        } else {
          return "";
        }
      });
  }

  step(custom_vars = {}) {
    const current_count = this._update_var("CURRENTCOUNT", +1);
    const progress = this._set_var("PROGRESS", Math.floor(100 / this.folder_stats.files * current_count));

    for (let kvar in custom_vars) {
      const id = this._get_key_id(kvar);

      if (this.vars.hasOwnProperty(id)) {
        this._update_var(id, custom_vars[kvar]);
      } else {
        this._set_var(id, custom_vars[kvar]);
      }
    }

    if (current_count - this.current_progress_step > this.progress_step || progress === 100) {
      log(this._replace_vars(this.step_msg));
      this.current_progress_step += this.progress_step;
    }
  }
}
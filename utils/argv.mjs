import { group } from "console";
import { panic } from "./panic.mjs";

class Option {
    static #UNDEF = Symbol();
    static #PROPS = Object.assign(Object.create(null), {
        WRITEABLE: {
            alias: Option.#UNDEF,
            assert: () => true,
            default: Option.#UNDEF,
            expected_args: 1,
            is_flag: false,
            is_required: false,
            process: (v) => v
        },
        PROTECTED: {
            is_set: false,
            args: Array()
        }
    });

    #self = Object.create(null);

    constructor(option, props) {
        try {
            Option.#validate(props);
            Object.assign(this.#self,
                Option.#PROPS.WRITEABLE, props,
                Option.#PROPS.PROTECTED
            );

            // Assign option as `name'.
            this.#self.name = option;

            // Set the expected arguments to 0 for flags.
            if (this.#self.is_flag)
                this.#self.expected_args = 0;

            // Automatically set the `alias' to the first letter of the `name' if none is defined.
            if (this.#self.alias === Option.#UNDEF)
                this.#self.alias = this.#self.name[0];

            // Prefix `name' and `alias' to match the command line inputs.
            this.#self.name = `--${this.#self.name}`;
            this.#self.alias = `-${this.#self.alias}`;
        } catch(err) {
            panic(err)`failed to create ${{ option }}`;
        }
    }

    static new(option, props) {
        return new Option(option, props);
    }

    static #validate(props) {
        const valid = Object.keys(this.#PROPS.WRITEABLE);

        for (let propertyName of Object.keys(props))
            if (!valid.includes(propertyName))
                panic`invalid ${{ propertyName }}`;
    }

    get name() {
        return this.#self.name;
    }

    get alias() {
        return this.#self.alias;
    }

    set is_set(bool) {
        this.#self.is_set = bool;
    }

    get args() {
        if (this.#self.is_flag)
            return this.#self.is_set;

        if (this.#self.is_set)
            return this.#self.expected_args > 1
                ? this.#self.args
                : this.#self.args[0];
        
        if (this.#self.default !== Option.#UNDEF)
            return this.#self.default;
        
        return null;
    }

    set args(value) {
        this.#self.args = value;
    }

    assert() {
        try {
            // Assert that required options are set.
            if (this.#self.is_required && this.#self.is_set === false)
                panic`required ${{ option: this.#self.name }} is not set`;

            // Assert the expected argument count.
            if (this.#self.default === Option.#UNDEF
                && this.#self.args.length < this.#self.expected_args
                && this.#self.expected_args === Infinity && this.#self.args.length === 0)
                panic`
                    expected ${{ $expected: this.#self.expected_args }} argument(s),
                    ${{ received: this.#self.args.length }}
                `;

            // Assert custom user function.
            this.#self.args.forEach(this.#self.assert);
        } catch(err) {
            panic(err)`failed to assert ${{ option: this.#self.name }}`;
        }
    }

    process() {
        this.#self.args = this.#self.args.map(this.#self.process);
    }
}

/** Utility class for parsing command line arguments. */
export default class Argv {
    node_exec;
    src_file;
    #argv;

    // Raw option definitions from the user.
    #options;

    // Parsed options.
    #args = Object.create(null);

    constructor(argv) {
        try {
            if (!Array.isArray(argv))
                panic`param 'argv' must be of type array`;

            if (argv.length < 2)
                panic`param 'argv' must contain at least two elements`;

            this.node_exec = argv.shift();
            this.src_file = argv.shift();
            this.#argv = argv;
        } catch(err) {
            panic(err)`failed to create Argv`;
        }
    }

    static new(argv = process.argv) {
        return new Argv(argv);
    }

    /**
     * Sets the options.
     * @param {object} options - CLI options.
     * @returns {this}
     */
    options(options) {
        this.#options = options;
        return this;
    }

    /**
     * Parses and returns the options.
     * @throws {Panic}
     * @returns {object};
     */
    parse() {
        this.#parse_options();
        this.#split_single_char_tokens();
        this.#extract_cli_values();

        for (let option of Object.values(this.#args)) {
            option.assert();
            option.process();
        }

        for (let [key, option] of Object.entries(this.#args))
            this.#args[key] = option.args;

        return this.#args;
    }

    /**
     * Parse user defined options.
     * @throws {Panic}
     * @returns {void}
     */
    #parse_options() {
        try {
            for (let [option, props] of Object.entries(this.#options))
                this.#args[option] = Option.new(option, props);
        } catch(err) {
            panic(err)`failed to parse options`;
        }
    }

    #is_option(str) {
        return this.#is_name(str) || this.#is_alias(str);
    }

    #is_name(str) {
        return /^--[^-]/.test(str);
    }

    #is_alias(str) {
        return /^-[^-]/.test(str);
    }

    #split_single_char_tokens() {
        for (let i = 0; i < this.#argv.length; ++i) {
            const cli_token = this.#argv[i];

            if (/^-[^-]/.test(cli_token) && !this.#get_defined_option(cli_token)) {
                const split = cli_token.substr(1).split(String()).map(t => `-${t}`);
                this.#argv.splice(i, 1, ...split);
            }
        }
    }

    /**
     * Groups argv tokens into groups of option and their argument(s).
     * [-i ./ -o /foo -o /bar /baz -c] → [[-i ./][-o /foo /bar /baz][-c]]
     * @returns {string[][]}
     */
    #group_cli_tokens() {
        let groups = Array();

        if (this.#argv.length === 0)
            return groups;

        for (let start = 0, end = 0; end < this.#argv.length + 1; ++end) {
            const cli_token = this.#argv[end];
            const is_option =
                // Ignore first entry.
                start !== end && this.#is_option(cli_token)
                // Loop out of bounds to handle last entry.
                || cli_token === undefined;

            if (is_option) {
                const command = this.#argv.slice(start, end); 
                const exists = groups.filter(group => {
                    if (group[0] === command[0])
                        return group.push(...command.slice(1));

                    return false;
                });

                if (exists.length === 0)
                    groups.push(command);

                start = end;
            }
        }

        return groups;
    }

    /**
     * Extracts the options and arguments from argv.
     * @throws {Panic}
     * @returns {void}
     */
    #extract_cli_values() {
        try {
            const grouped_cli_tokens = this.#group_cli_tokens();

            for (let [option, ...args] of grouped_cli_tokens) {
                const defined_option = this.#get_defined_option(option);

                if (defined_option === false)
                    panic`unkown ${{ option }}`;

                defined_option.is_set = true;
                defined_option.args = args;
            }
        } catch(err) {
            panic(err)`failed to parse command line arguments`;
        }
    }

    /**
     * Returns an user defined <Option> if defined.
     * @param {string} option - Option to return.
     * @returns {object|false}
     */
    #get_defined_option(option) {
        for (let arg of Object.values(this.#args)) {
            if (this.#is_name(option) && option === arg.name ||
                this.#is_alias(option) && option === arg.alias)
                return arg;
        }

        return false;
    }
}
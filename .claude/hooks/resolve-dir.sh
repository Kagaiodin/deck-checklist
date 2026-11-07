# Sourced by the hooks. resolve_command_dir <command> <cwd>: the directory the command runs in.
# A leading `cd <dir> &&` / `cd <dir>;` wins over cwd (relative dirs resolve against cwd).
# Deliberately not a shell parser: only that one leading form is understood.
resolve_command_dir() {
  local cmd=$1 cwd=$2 target
  if [[ $cmd =~ ^[[:space:]]*cd[[:space:]]+(\"([^\"]*)\"|\'([^\']*)\'|([^[:space:];\&|]+))[[:space:]]*(\&\&|\;) ]]; then
    target=${BASH_REMATCH[2]:-${BASH_REMATCH[3]:-${BASH_REMATCH[4]}}}
    case "$target" in
      /*) echo "$target" ;;
      "~"|"~/"*) echo "$HOME${target#\~}" ;;
      *) echo "$cwd/$target" ;;
    esac
  else
    echo "$cwd"
  fi
}

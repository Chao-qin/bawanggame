# Flash Test Game

`sample-game.swf` is an original ActionScript 3 game used to verify Ruffle's
AVM2 startup, vector drawing, text, and touch/mouse input. Tap the star to
increase the score.

The game source and compiled SWF are licensed under MIT; see `LICENSE`.

## Rebuild

Use Apache Flex SDK 4.16.1. Set `FLEX_HOME` to the extracted SDK directory. Flex needs the ActionScript API definitions from `playerglobal.swc`; install the 27.0 file under the SDK's player libraries. The upstream `nexussays/playerglobal` repository identifies these files as MPL-1.1. This compiler input is not included in the project or app bundle.

```sh
PLAYERGLOBAL_HOME="$FLEX_HOME/frameworks/libs/player"
mkdir -p "$PLAYERGLOBAL_HOME/27.0"
curl -fL https://raw.githubusercontent.com/nexussays/playerglobal/fef560243029214656d83fc673be0267a1ea0816/27.0/playerglobal.swc -o "$PLAYERGLOBAL_HOME/27.0/playerglobal.swc"
PLAYERGLOBAL_HOME="$PLAYERGLOBAL_HOME" "$FLEX_HOME/bin/mxmlc" -version
PLAYERGLOBAL_HOME="$PLAYERGLOBAL_HOME" "$FLEX_HOME/bin/mxmlc" -target-player=27.0 -output=games/flash/sample-game.swf -static-link-runtime-shared-libraries=true -use-network=false games/flash/src/Main.as
```

Source and license for the compiler API file: <https://github.com/nexussays/playerglobal/tree/fef560243029214656d83fc673be0267a1ea0816/27.0>.

Ruffle is separately licensed under MIT or Apache-2.0. Its license files are
copied into the packaged site with its runtime distribution.

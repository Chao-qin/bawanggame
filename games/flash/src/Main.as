package {
    import flash.display.Sprite;
    import flash.display.StageAlign;
    import flash.display.StageScaleMode;
    import flash.events.Event;
    import flash.events.MouseEvent;
    import flash.text.TextField;
    import flash.text.TextFormat;

    public class Main extends Sprite {
        private const GAME_WIDTH:Number = 640;
        private const GAME_HEIGHT:Number = 480;
        private const target:Sprite = new Sprite();
        private const scoreText:TextField = new TextField();
        private var score:int = 0;

        public function Main() {
            addEventListener(Event.ADDED_TO_STAGE, onAddedToStage);
        }

        private function onAddedToStage(event:Event):void {
            removeEventListener(Event.ADDED_TO_STAGE, onAddedToStage);
            stage.scaleMode = StageScaleMode.SHOW_ALL;
            stage.align = StageAlign.TOP;

            graphics.beginFill(0x14263D);
            graphics.drawRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
            graphics.endFill();

            const title:TextField = makeText("STAR CATCHER", 30, 0xFFFFFF, true);
            title.x = 28;
            title.y = 22;
            title.width = 360;
            title.height = 42;
            addChild(title);

            scoreText.defaultTextFormat = new TextFormat("_sans", 22, 0xBDE0FE, true);
            scoreText.selectable = false;
            scoreText.width = 200;
            scoreText.height = 34;
            scoreText.text = "Score: 0";
            scoreText.x = 28;
            scoreText.y = 74;
            addChild(scoreText);

            const instruction:TextField = makeText("Tap the star to score", 18, 0xD7E5F3, false);
            instruction.x = 28;
            instruction.y = 114;
            instruction.width = 330;
            instruction.height = 30;
            addChild(instruction);

            drawTarget();
            target.buttonMode = true;
            target.addEventListener(MouseEvent.CLICK, onTargetClick);
            addChild(target);
            placeTarget();

            stage.addEventListener(Event.RESIZE, onStageResize);
        }

        private function makeText(value:String, size:int, color:uint, bold:Boolean):TextField {
            const field:TextField = new TextField();
            field.defaultTextFormat = new TextFormat("_sans", size, color, bold);
            field.selectable = false;
            field.text = value;
            return field;
        }

        private function drawTarget():void {
            target.graphics.lineStyle(3, 0xFFF0B3, 1);
            target.graphics.beginFill(0xFFC857);
            for (var point:int = 0; point < 10; point++) {
                const angle:Number = -Math.PI / 2 + point * Math.PI / 5;
                const radius:Number = point % 2 == 0 ? 52 : 24;
                const px:Number = Math.cos(angle) * radius;
                const py:Number = Math.sin(angle) * radius;
                if (point == 0) target.graphics.moveTo(px, py);
                else target.graphics.lineTo(px, py);
            }
            target.graphics.lineTo(0, -52);
            target.graphics.endFill();
        }

        private function onTargetClick(event:MouseEvent):void {
            event.stopPropagation();
            score++;
            scoreText.text = "Score: " + score;
            placeTarget();
        }

        private function onStageResize(event:Event):void {
            placeTarget();
        }

        private function placeTarget():void {
            const width:Number = stage ? stage.stageWidth : GAME_WIDTH;
            const height:Number = stage ? stage.stageHeight : GAME_HEIGHT;
            const minX:Number = Math.min(92, width / 2);
            const maxX:Number = Math.max(minX, width - 44);
            const minY:Number = Math.min(196, height / 2);
            const maxY:Number = Math.max(minY, height - 48);
            target.x = minX + Math.random() * (maxX - minX);
            target.y = minY + Math.random() * (maxY - minY);
        }
    }
}

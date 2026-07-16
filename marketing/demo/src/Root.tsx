import "./index.css";
import { Composition } from "remotion";
import { GrindeasyDemo } from "./GrindeasyDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="GrindeasyDemo"
      component={GrindeasyDemo}
      durationInFrames={840}
      fps={30}
      width={1280}
      height={720}
    />
  );
};

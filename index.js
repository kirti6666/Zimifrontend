import { registerRootComponent } from "expo";

import App from "./App";
import { registerBackgroundPush } from "./src/push";

// Before the app registers, so pushes and call buttons work while it is closed.
registerBackgroundPush();
registerRootComponent(App);

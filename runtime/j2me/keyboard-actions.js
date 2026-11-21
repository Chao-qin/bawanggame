(function (root) {
  function install(actions, target) {
    var host = target || root;
    var session = host.__XIAOCHAO_KEYBOARD_SESSION__;
    if (!session || !actions || typeof actions !== "object") return null;
    session.actions = actions;
    return actions;
  }

  root.KeyboardActions = Object.freeze({ install: install });
})(window);

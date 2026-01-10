# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-25.05";
  # Use https://search.nixos.org/packages to find packages
  packages = [ pkgs.nodejs_20 ];
  # Sets environment variables in the workspace
  env = { EXPO_USE_FAST_RESOLVER = "1"; };
  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      "msjsdiag.vscode-react-native"
    ];
    workspace = {
      # Runs when a workspace is first created with this `dev.nix` file
      onCreate = {
        install =
          "npm ci --prefer-offline --no-audit --no-progress --timing && npm i @expo/ngrok@^4.1.0 react@latest react-dom@latest react-native@latest && npm i -D @types/react@latest";
      };
      # Runs when a workspace restarted
      onStart = {
        # This is a hack to start metro with tunnel and then run android
        android = ''
          echo -e "\033[1;33mWaiting for Android emulator to be ready...\033[0m"
          adb -s emulator-5554 wait-for-device && \
          (npm start -- --tunnel &) && \
          npm run android
        '';
      };
    };
    # Enable previews and customize configuration
    previews = {
      enable = true;
      previews = {
        web = {
          command = [ "npm" "run" "web" "--" "--port" "$PORT" ];
          manager = "web";
        };
        android = {
          # noop
          command = [ "tail" "-f" "/dev/null" ];
          manager = "web";
        };
      };
    };
  };
}

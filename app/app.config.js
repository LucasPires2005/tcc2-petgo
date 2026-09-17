const appJson = require('./app.json');

module.exports = {
  ...appJson.expo,
  android: {
    ...appJson.expo.android,
    permissions: [
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION'
    ]
  },
  plugins: [
    ...(appJson.expo.plugins || []),
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Permita que o PetGo use sua localização para encontrar animais próximos.'
      }
    ],
    '@maplibre/maplibre-react-native'
  ]
};

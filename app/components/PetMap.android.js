import React from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import MapView, { Marker as NativeMarker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

// OpenFreeMap usa dados do OpenStreetMap e não exige chave de API.
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

function ExpoGoMap({
  location,
  animals,
  selectedLocation,
  isPremium,
  onSelectLocation,
  onSelectAnimal
}) {
  return (
    <MapView
      style={styles.map}
      initialRegion={{
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01
      }}
      onLongPress={(event) => onSelectLocation(event.nativeEvent.coordinate)}
    >
      <NativeMarker coordinate={location}>
        <View style={[styles.userMarker, isPremium && styles.userMarkerPremium]}>
          <Ionicons name={isPremium ? 'star' : 'person'} size={20} color="#FFF" />
        </View>
      </NativeMarker>

      {animals.map((animal) => (
        <NativeMarker
          key={animal.id}
          coordinate={{ latitude: animal.latitude, longitude: animal.longitude }}
          onPress={() => onSelectAnimal(animal)}
        >
          <View style={[styles.petMarker, { backgroundColor: animal.markerColor }]}>
            <Ionicons name="paw" size={16} color="#FFF" />
          </View>
        </NativeMarker>
      ))}

      {selectedLocation && (
        <NativeMarker coordinate={selectedLocation}>
          <Ionicons name="location" size={40} color="#2ECC71" />
        </NativeMarker>
      )}
    </MapView>
  );
}

export default function PetMap({
  location,
  animals,
  selectedLocation,
  isPremium,
  onSelectLocation,
  onSelectAnimal
}) {
  if (Constants.executionEnvironment === 'storeClient') {
    return (
      <ExpoGoMap
        location={location}
        animals={animals}
        selectedLocation={selectedLocation}
        isPremium={isPremium}
        onSelectLocation={onSelectLocation}
        onSelectAnimal={onSelectAnimal}
      />
    );
  }

  // Carregamento tardio: o módulo nativo não está incluído no Expo Go.
  const { Camera, Map, Marker } = require('@maplibre/maplibre-react-native');
  const userCoordinates = [location.longitude, location.latitude];

  return (
    <Map
      style={styles.map}
      mapStyle={MAP_STYLE_URL}
      attribution
      logo={false}
      compass
      onLongPress={(event) => {
        const [longitude, latitude] = event.nativeEvent.lngLat;
        onSelectLocation({ latitude, longitude });
      }}
    >
      <Camera
        initialViewState={{
          center: userCoordinates,
          zoom: 15
        }}
      />

      <Marker id="current-user" lngLat={userCoordinates}>
        <View style={[styles.userMarker, isPremium && styles.userMarkerPremium]}>
          <Ionicons name={isPremium ? 'star' : 'person'} size={20} color="#FFF" />
        </View>
      </Marker>

      {animals.map((animal) => (
        <Marker
          id={`animal-${animal.id}`}
          key={animal.id}
          lngLat={[animal.longitude, animal.latitude]}
          onPress={() => onSelectAnimal(animal)}
        >
          <View style={[styles.petMarker, { backgroundColor: animal.markerColor }]}>
            <Ionicons name="paw" size={16} color="#FFF" />
          </View>
        </Marker>
      ))}

      {selectedLocation && (
        <Marker
          id="selected-location"
          lngLat={[selectedLocation.longitude, selectedLocation.latitude]}
        >
          <Ionicons name="location" size={40} color="#2ECC71" />
        </Marker>
      )}
    </Map>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  userMarker: {
    backgroundColor: '#4A90E2',
    padding: 6,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FFF'
  },
  userMarkerPremium: { backgroundColor: '#FFD700', borderColor: '#B8860B' },
  petMarker: {
    padding: 6,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#FFF'
  }
});

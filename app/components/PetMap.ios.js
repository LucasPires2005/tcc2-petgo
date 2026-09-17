import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

export default function PetMap({
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
      <Marker coordinate={location}>
        <View style={[styles.userMarker, isPremium && styles.userMarkerPremium]}>
          <Ionicons name={isPremium ? 'star' : 'person'} size={20} color="#FFF" />
        </View>
      </Marker>

      {animals.map((animal) => (
        <Marker
          key={animal.id}
          coordinate={{
            latitude: animal.latitude,
            longitude: animal.longitude
          }}
          onPress={() => onSelectAnimal(animal)}
        >
          <View style={[styles.petMarker, { backgroundColor: animal.markerColor }]}>
            <Ionicons name="paw" size={16} color="#FFF" />
          </View>
        </Marker>
      ))}

      {selectedLocation && (
        <Marker coordinate={selectedLocation}>
          <Ionicons name="location" size={40} color="#2ECC71" />
        </Marker>
      )}
    </MapView>
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

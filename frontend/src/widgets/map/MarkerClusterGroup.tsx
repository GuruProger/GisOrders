import { createPathComponent, type LeafletContextInterface, type PathProps } from '@react-leaflet/core'
import L from 'leaflet'
import 'leaflet.markercluster'
import type { ReactNode } from 'react'

export interface MarkerClusterGroupProps extends PathProps {
  children?: ReactNode
}

function createCluster(
  _props: Readonly<MarkerClusterGroupProps>,
  context: LeafletContextInterface,
) {
  const cluster = L.markerClusterGroup()
  return { instance: cluster, context: { ...context, layerContainer: cluster } }
}

/**
 * Thin react-leaflet bridge for `leaflet.markercluster`: children (markers) are
 * mounted into the cluster group's own layer container.
 */
export const MarkerClusterGroup = createPathComponent<
  L.MarkerClusterGroup,
  MarkerClusterGroupProps
>(createCluster)

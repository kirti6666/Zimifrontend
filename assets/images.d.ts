/* Metro resolves image imports to an asset reference for <Image source>. */
declare module "*.png" {
  const source: import("react-native").ImageSourcePropType;
  export default source;
}

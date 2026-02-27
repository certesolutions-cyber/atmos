/// @property baseColor: vec4 = (0.0, 1.0, 0.0, 1.0)
/// @property brightness: float = 1.0

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    let N = normalize(input.worldNormal);
    let V = normalize(scene.cameraPos.xyz - input.worldPosition);

    // Use computeLightLoop for basic lighting
    let albedo = custom.baseColor.rgb * custom.brightness;
    let F0 = vec3<f32>(0.04);
    let Lo = computeLightLoop(N, V, albedo, 0.0, 0.5, F0, input.worldPosition);

    let ambient = vec3<f32>(0.05) * albedo;
    var color = ambient + Lo;
    color = applyFog(color, input.worldPosition);
    return vec4<f32>(color, custom.baseColor.a);
}

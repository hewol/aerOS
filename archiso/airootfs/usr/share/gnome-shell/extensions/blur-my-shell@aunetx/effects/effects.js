import { NativeDynamicBlurEffect } from '../effects/native_dynamic_gaussian_blur.js';
import { NativeStaticBlurEffect } from '../effects/native_static_gaussian_blur.js';
import { GaussianBlurEffect } from '../effects/gaussian_blur.js';
import { MonteCarloBlurEffect } from '../effects/monte_carlo_blur.js';
import { ColorEffect } from '../effects/color.js';
import { PixelizeEffect } from './pixelize.js';
import { NoiseEffect } from '../effects/noise.js';
import { CornerEffect } from '../effects/corner.js';

// We do in this way because I've not found another way to store our preferences in a dictionnary
// while calling `gettext` on it while in preferences. Not so pretty, but works.
export function get_effects_groups(_ = _ => "") {
    return {
        blur_effects: {
            name: _("Blur effects"),
            contains: [
                "native_static_gaussian_blur",
                "gaussian_blur",
                "monte_carlo_blur"
            ]
        },
        texture_effects: {
            name: _("Texture effects"),
            contains: [
                "pixelize",
                "noise",
                "color"
            ]
        },
        shape_effects: {
            name: _("Shape effects"),
            contains: [
                "corner"
            ]
        }
    };
};

export function get_supported_effects(_ = () => "") {
    return {
        native_dynamic_gaussian_blur: {
            class: NativeDynamicBlurEffect
        },

        native_static_gaussian_blur: {
            class: NativeStaticBlurEffect,
            name: _("Native gaussian blur"),
            description: _("An optimized blur effect that smoothly blends pixels within a given radius."),
            editable_params: {
                unscaled_radius: {
                    name: _("Radius"),
                    description: _("The intensity of the blur effect."),
                    type: "float",
                    min: 0.,
                    max: 100.,
                    increment: 1.0,
                    big_increment: 10.,
                    digits: 0
                },
                brightness: {
                    name: _("Brightness"),
                    description: _("The brightness of the blur effect, a high value might make the text harder to read."),
                    type: "float",
                    min: 0.,
                    max: 1.,
                    increment: 0.01,
                    big_increment: 0.1,
                    digits: 2
                },
            }
        },

        gaussian_blur: {
            class: GaussianBlurEffect,
            name: _("Gaussian blur"),
            description: _("A blur effect that smoothly blends pixels within a given radius. This effect is more precise, but way less optimized."),
            editable_params: {
                radius: {
                    name: _("Radius"),
                    description: _("The intensity of the blur effect. The bigger it is, the slower it will be."),
                    type: "float",
                    min: 0.,
                    max: 100.,
                    increment: .1,
                    big_increment: 10.,
                    digits: 1
                },
                brightness: {
                    name: _("Brightness"),
                    description: _("The brightness of the blur effect, a high value might make the text harder to read."),
                    type: "float",
                    min: 0.,
                    max: 1.,
                    increment: 0.01,
                    big_increment: 0.1,
                    digits: 2
                },
            }
        },

        monte_carlo_blur: {
            class: MonteCarloBlurEffect,
            name: _("Monte Carlo blur"),
            description: _("A blur effect that mimics a random walk, by picking pixels further and further away from its origin and mixing them all together."),
            editable_params: {
                radius: {
                    name: _("Radius"),
                    description: _("The maximum travel distance for each step in the random walk. A higher value will make the blur more randomized."),
                    type: "float",
                    min: 0.,
                    max: 10.,
                    increment: 0.01,
                    big_increment: 0.1,
                    digits: 2
                },
                iterations: {
                    name: _("Iterations"),
                    description: _("The number of iterations. The more there are, the smoother the blur is."),
                    type: "integer",
                    min: 0,
                    max: 50,
                    increment: 1
                },
                brightness: {
                    name: _("Brightness"),
                    description: _("The brightness of the blur effect, a high value might make the text harder to read."),
                    type: "float",
                    min: 0.,
                    max: 1.,
                    increment: 0.01,
                    big_increment: 0.1,
                    digits: 2
                },
                use_base_pixel: {
                    name: _("Use base pixel"),
                    description: _("Whether or not the original pixel is counted for the blur. If it is, the image will be more legible."),
                    type: "boolean"
                }
            }
        },

        color: {
            class: ColorEffect,
            name: _("Color"),
            description: _("An effect that blends a color into the pipeline."),
            // TODO make this RGB + blend
            editable_params: {
                color: {
                    name: _("Color"),
                    description: _("The color to blend in. The blending amount is controled by the opacity of the color."),
                    type: "rgba"
                }
            }
        },

        pixelize: {
            class: PixelizeEffect,
            name: _("Pixelize"),
            description: _("An effect that pixelizes the image."),
            editable_params: {
                divider: {
                    name: _("Divider"),
                    description: _("How much to scale down the image."),
                    type: "integer",
                    min: 1,
                    max: 50,
                    increment: 1
                }
            }
        },

        noise: {
            class: NoiseEffect,
            name: _("Noise"),
            description: _("An effect that adds a random noise. Prefer the Monte Carlo blur for a more organic effect if needed."),
            editable_params: {
                noise: {
                    name: _("Noise"),
                    description: _("The amount of noise to add."),
                    type: "float",
                    min: 0.,
                    max: 1.,
                    increment: 0.01,
                    big_increment: 0.1,
                    digits: 2
                },
                lightness: {
                    name: _("Lightness"),
                    description: _("The luminosity of the noise. A setting of '1.0' will make the effect transparent."),
                    type: "float",
                    min: 0.,
                    max: 2.,
                    increment: 0.01,
                    big_increment: 0.1,
                    digits: 2
                }
            }
        },

        corner: {
            class: CornerEffect,
            name: _("Corner"),
            description: _("An effect that draws corners. Add it last not to have the other effects perturb the corners."),
            editable_params: {
                radius: {
                    name: _("Radius"),
                    description: _("The radius of the corner. GNOME apps use a radius of 12 px by default."),
                    type: "integer",
                    min: 0,
                    max: 50,
                    increment: 1,
                },
                corners_top: {
                    name: _("Top corners"),
                    description: _("Whether or not to round the top corners."),
                    type: "boolean"
                },
                corners_bottom: {
                    name: _("Bottom corners"),
                    description: _("Whether or not to round the bottom corners."),
                    type: "boolean"
                }
            }
        }
    };
};
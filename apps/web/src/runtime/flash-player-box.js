/** The Ruffle player's box for the 「画面缩放」 choice, given the movie's size: the whole picture, or fill the width /
 *  the height of the screen box, centred (the other axis is cropped by the host). Sizing the element to the movie's
 *  own aspect also keeps the picture centred whatever stage alignment the movie asks for. */
export function flashPlayerBox(fit, box, movie) {
  if (!(movie?.width > 0 && movie?.height > 0 && box.width > 0 && box.height > 0)) return null
  const scaleX = box.width / movie.width
  const scaleY = box.height / movie.height
  const scale = fit === 'width' ? scaleX : fit === 'height' ? scaleY : Math.min(scaleX, scaleY)
  const width = movie.width * scale
  const height = movie.height * scale
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height }
}

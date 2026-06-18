#!/usr/bin/env python3
"""Resize PNG to multiple sizes using nearest-neighbor (no PIL needed)."""

import struct
import zlib
import os
import sys

def paeth(a, b, c):
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    elif pb <= pc:
        return b
    return c

def unfilter_row(row, prev, bpp):
    ft = row[0]
    out = bytearray(len(row))
    for i in range(len(row)):
        if i == 0:
            out[i] = row[i]
            continue
        x = row[i]
        a = out[i - bpp] if i >= bpp else 0
        c = prev[i - bpp] if prev and i >= bpp else 0
        b_ = prev[i] if prev else 0
        if ft == 0:
            out[i] = x
        elif ft == 1:
            out[i] = (x + a) & 0xff
        elif ft == 2:
            out[i] = (x + b_) & 0xff
        elif ft == 3:
            out[i] = (x + (a + b_) // 2) & 0xff
        elif ft == 4:
            out[i] = (x + paeth(a, b_, c)) & 0xff
    return out

def read_png(path):
    with open(path, 'rb') as f:
        sig = f.read(8)
        if sig != b'\x89PNG\r\n\x1a\n':
            raise ValueError('Not a PNG')
        chunks = []
        while True:
            length = struct.unpack('>I', f.read(4))[0]
            chunk_type = f.read(4)
            data = f.read(length)
            crc = f.read(4)
            chunks.append((chunk_type, data))
            if chunk_type == b'IEND':
                break
    return chunks

def get_ihdr(chunks):
    for t, d in chunks:
        if t == b'IHDR':
            w = struct.unpack('>I', d[:4])[0]
            h = struct.unpack('>I', d[4:8])[0]
            bit_depth = d[8]
            color_type = d[9]
            return w, h, bit_depth, color_type
    raise ValueError('No IHDR')

def get_pixels(chunks, w, h, bpp):
    raw = b''
    for t, d in chunks:
        if t == b'IDAT':
            raw += d
    raw = zlib.decompress(raw)

    stride = 1 + w * bpp
    pixels = bytearray(h * w * bpp)
    prev = bytearray(stride)
    for y in range(h):
        row_start = y * stride
        row = raw[row_start:row_start + stride]
        row = unfilter_row(row, prev, bpp)
        prev = row
        src = 1
        dst = y * w * bpp
        for x in range(w):
            pixels[dst:dst + bpp] = row[src:src + bpp]
            src += bpp
            dst += bpp
    return bytes(pixels)

def make_png(width, height, bit_depth, color_type, pixels):
    def make_chunk(t, d):
        data = t + d
        crc = struct.pack('>I', zlib.crc32(data) & 0xffffffff)
        return struct.pack('>I', len(d)) + data + crc

    bpp = 4 if color_type == 6 else (3 if color_type == 2 else 1)
    stride = 1 + width * bpp
    raw = bytearray(height * stride)
    for y in range(height):
        off = y * stride
        raw[off] = 0
        src = y * width * bpp
        dst = off + 1
        for x in range(width):
            raw[dst:dst + bpp] = pixels[src:src + bpp]
            src += bpp
            dst += bpp

    compressed = zlib.compress(bytes(raw))
    ihdr = struct.pack('>IIBBBBB', width, height, bit_depth, color_type, 0, 0, 0)
    out = b'\x89PNG\r\n\x1a\n'
    out += make_chunk(b'IHDR', ihdr)
    out += make_chunk(b'IDAT', compressed)
    out += make_chunk(b'IEND', b'')
    return out

def resize_nearest(src_pixels, src_w, src_h, dst_w, dst_h, bpp):
    dst = bytearray(dst_w * dst_h * bpp)
    for dy in range(dst_h):
        sy = dy * src_h // dst_h
        for dx in range(dst_w):
            sx = dx * src_w // dst_w
            s = (sy * src_w + sx) * bpp
            d = (dy * dst_w + dx) * bpp
            dst[d:d + bpp] = src_pixels[s:s + bpp]
    return bytes(dst)

def main():
    src_path = sys.argv[1]
    dst_dir = sys.argv[2] if len(sys.argv) > 2 else '.'

    chunks = read_png(src_path)
    w, h, bit_depth, color_type = get_ihdr(chunks)
    bpp = 4 if color_type == 6 else (3 if color_type == 2 else 1)

    pixels = get_pixels(chunks, w, h, bpp)

    sizes = [
        ('default256.png', 256, 256),
        ('default128.png', 128, 128),
        ('default64.png', 64, 64),
        ('default48.png', 48, 48),
        ('default32.png', 32, 32),
        ('default16.png', 16, 16),
        ('about-logo.png', 128, 96),
        ('PrivateBrowsing_48.png', 48, 48),
        ('PrivateBrowsing_32.png', 32, 32),
        ('PrivateBrowsing_16.png', 16, 16),
        ('VisualElements_256.png', 256, 256),
        ('VisualElements_48.png', 48, 48),
    ]

    for name, dw, dh in sizes:
        dst_pixels = resize_nearest(pixels, w, h, dw, dh, bpp)
        png_data = make_png(dw, dh, bit_depth, color_type, dst_pixels)
        path = os.path.join(dst_dir, name)
        with open(path, 'wb') as f:
            f.write(png_data)
        sz = os.path.getsize(path)
        print(f'  {name} ({dw}x{dh}) = {sz}b')

if __name__ == '__main__':
    main()

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <array>
#include <algorithm>

double number(const char* input) {
    const std::string value(input);
    std::size_t end = 0;
    const double result = std::stod(value, &end);
    if (end != value.size() || !std::isfinite(result) || std::abs(result) > 1000)
        throw std::invalid_argument("Coordinates must be finite metres between -1000 and 1000");
    return result;
}

double dimension(const char* input) {
    const double result = number(input);
    if(result < .1) throw std::invalid_argument("Dimensions must be at least 0.1 m");
    return result;
}
struct Point { double x, z; };
int main(int argc, char** argv) {
    try {
        if (argc == 11 && std::string(argv[1]) == "--polygon") {
            const double height = dimension(argv[2]);
            std::array<Point,4> points;
            for(int i=0;i<4;i++) points[i] = {number(argv[3+i*2]),number(argv[4+i*2])};
            double twiceArea=0, perimeter=0;
            double minX=1000,maxX=-1000,minZ=1000,maxZ=-1000;
            for(int i=0;i<4;i++) {
                const auto a=points[i], b=points[(i+1)%4], c=points[(i+2)%4];
                const double length=std::hypot(b.x-a.x,b.z-a.z);
                const double cross=(b.x-a.x)*(c.z-b.z)-(b.z-a.z)*(c.x-b.x);
                if(length < .1-1e-9 || cross <= 1e-8) throw std::invalid_argument("Expected a convex clockwise plan outline");
                twiceArea+=a.x*b.z-b.x*a.z; perimeter+=length;
                minX=std::min(minX,a.x); maxX=std::max(maxX,a.x);
                minZ=std::min(minZ,a.z); maxZ=std::max(maxZ,a.z);
            }
            if(maxX-minX<.1 || maxZ-minZ<.1 || maxX-minX>1000 || maxZ-minZ>1000)
                throw std::invalid_argument("Room span must be between 0.1 and 1000 m");
            const double area=twiceArea/2;
            std::cout << std::setprecision(15) << "{\"area\":" << area
                      << ",\"volume\":" << area*height << ",\"perimeter\":" << perimeter << "}\n";
            return 0;
        }
        if (argc != 4) throw std::invalid_argument("Usage: terratec-core WIDTH DEPTH HEIGHT");
        const double w = dimension(argv[1]), d = dimension(argv[2]), h = dimension(argv[3]);
        std::cout << std::setprecision(15) << "{\"area\":" << w*d
                  << ",\"volume\":" << w*d*h << ",\"perimeter\":" << 2*(w+d) << "}\n";
        return 0;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}

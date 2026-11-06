#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>

double dimension(const char* input) {
    const std::string value(input);
    std::size_t end = 0;
    const double result = std::stod(value, &end);
    if (end != value.size() || !std::isfinite(result) || result < 0.1 || result > 1000)
        throw std::invalid_argument("Dimensions must be finite metres between 0.1 and 1000");
    return result;
}

int main(int argc, char** argv) {
    try {
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
